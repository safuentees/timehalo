import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// B2 — round-robin host selection wired through bookings.create.
//
// createTestHost seeds a User + Workspace + Membership but doesn't
// seed an EventType (test fixture is older than the B2 schema). For
// the singleton-fixed case we let the booking fall through to
// pickedHostId = host.id (current behavior, eventTypeId stays null).
//
// For multi-host coverage we manually mint an EventType + two
// EventTypeHost rows on the SAME workspace. Both hosts share the
// same handle's bookable surface; the round-robin algorithm picks
// based on priority + weight + recentAssignments. The contract here:
// (a) two hosts, equal weight, zero recent → first booking lands on
//     either deterministically (id-sort tiebreak); second booking
//     after the first's recentAssignments bumped → other host gets
//     it.
// (b) higher-priority host always wins regardless of weight.

const callRouter = createCaller(appRouter);
const HANDLE_RR = "vitest-rr";

async function attachSecondHostToEventType(opts: {
  hostHandle: string;
  secondUser: { id: string };
}): Promise<{ eventTypeId: string }> {
  const host = await prisma.user.findUniqueOrThrow({
    where: { handle: opts.hostHandle },
    select: {
      id: true,
      ownedWorkspaces: {
        select: { id: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const workspaceId = host.ownedWorkspaces[0].id;

  // Seed the EventType + the host's own EventTypeHost (the test
  // fixture pre-dates B2, so it's missing). Then add the second host.
  const eventType = await prisma.eventType.upsert({
    where: { workspaceId_slug: { workspaceId, slug: opts.hostHandle } },
    create: {
      workspaceId,
      slug: opts.hostHandle,
      name: opts.hostHandle,
      durationMins: 15,
    },
    update: {},
    select: { id: true },
  });
  await prisma.eventTypeHost.upsert({
    where: {
      eventTypeId_userId: { eventTypeId: eventType.id, userId: host.id },
    },
    create: {
      eventTypeId: eventType.id,
      userId: host.id,
      isFixed: false, // turn the singleton into a pool member
      priority: 2,
      weight: 1,
      recentAssignments: 0,
    },
    update: { isFixed: false },
  });
  await prisma.eventTypeHost.upsert({
    where: {
      eventTypeId_userId: {
        eventTypeId: eventType.id,
        userId: opts.secondUser.id,
      },
    },
    create: {
      eventTypeId: eventType.id,
      userId: opts.secondUser.id,
      isFixed: false,
      priority: 2,
      weight: 1,
      recentAssignments: 0,
    },
    update: { isFixed: false },
  });

  return { eventTypeId: eventType.id };
}

describe("B2 — round-robin in bookings.create", () => {
  let host: { id: string; handle: string };
  let secondHost: { id: string };
  let eventTypeId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE_RR);
    // Second host: any User with availability ranges so the round-
    // robin pick can land. We only need the user row; this user
    // doesn't need their own handle for the test path because the
    // booking targets the FIRST host's handle and the algorithm
    // picks across the EventType's host pool.
    const u = await prisma.user.create({
      data: {
        email: `vitest-rr-second-${Date.now()}@test.local`,
        availabilityRanges: {
          create: [
            { dayOfWeek: "MONDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "TUESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "WEDNESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "THURSDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "FRIDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SATURDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SUNDAY", startTime: "00:00", endTime: "23:45" },
          ],
        },
      },
      select: { id: true },
    });
    secondHost = u;
    const result = await attachSecondHostToEventType({
      hostHandle: host.handle,
      secondUser: secondHost,
    });
    eventTypeId = result.eventTypeId;
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
    // Reset recentAssignments so each test starts from zero.
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId },
      data: { recentAssignments: 0 },
    });
  });

  afterAll(async () => {
    await prisma.eventTypeHost.deleteMany({ where: { eventTypeId } });
    await prisma.eventType.deleteMany({ where: { id: eventTypeId } });
    await prisma.user.deleteMany({ where: { id: secondHost.id } });
    await tearDownTestHost(host.id);
  });

  it("multi-host EventType: first booking stamps eventTypeId + picks deterministically", async () => {
    const caller = callRouter(fakeContext());
    const slot = tomorrowAtMinute(0);
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: slot.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const row = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: created.publicUid },
      select: { hostId: true, eventTypeId: true },
    });
    expect(row.eventTypeId).toBe(eventTypeId);
    // Tiebreak is id-sort (lowercase alpha). Both hosts have score 0
    // / 1 = 0; the lower id wins. Assert that the picked host is one
    // of the two and matches the expected tiebreak.
    expect([host.id, secondHost.id]).toContain(row.hostId);
    const expected = [host.id, secondHost.id].sort()[0];
    expect(row.hostId).toBe(expected);

    // recentAssignments was bumped on the picked host.
    const winnerRow = await prisma.eventTypeHost.findFirstOrThrow({
      where: { eventTypeId, userId: row.hostId },
      select: { recentAssignments: true },
    });
    const loserId = row.hostId === host.id ? secondHost.id : host.id;
    const loserRow = await prisma.eventTypeHost.findFirstOrThrow({
      where: { eventTypeId, userId: loserId },
      select: { recentAssignments: true },
    });
    expect(winnerRow.recentAssignments).toBe(1);
    expect(loserRow.recentAssignments).toBe(0);
  });

  it("second booking flips to the OTHER host once recentAssignments bumps", async () => {
    const caller = callRouter(fakeContext());

    // First booking — same id-sort tiebreak as the prior test.
    const first = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const firstRow = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: first.publicUid },
      select: { hostId: true },
    });

    // Second booking, different slot. Round-robin should now favor
    // the OTHER host (winner had recentAssignments bumped to 1, loser
    // still at 0; loser's score is 0 vs 1/1 = 1, lower wins).
    const second = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Lin",
      visitorEmail: "lin@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const secondRow = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: second.publicUid },
      select: { hostId: true },
    });
    expect(secondRow.hostId).not.toBe(firstRow.hostId);
  });

  it("higher-priority host always wins regardless of weight", async () => {
    // Bump the second host's priority so they outrank the original.
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: secondHost.id },
      data: { priority: 5, weight: 99 }, // huge weight, doesn't matter
    });
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: host.id },
      data: { priority: 1, weight: 1, recentAssignments: 0 },
    });

    const caller = callRouter(fakeContext());
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const row = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: created.publicUid },
      select: { hostId: true },
    });
    expect(row.hostId).toBe(secondHost.id);

    // Reset for the rest of the suite — the afterAll teardown
    // doesn't care about field values, but other tests in this file
    // assume both hosts at priority 2.
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: secondHost.id },
      data: { priority: 2, weight: 1 },
    });
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: host.id },
      data: { priority: 2, weight: 1 },
    });
  });
});
