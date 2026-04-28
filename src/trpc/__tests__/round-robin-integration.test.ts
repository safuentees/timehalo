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
    expect([host.id, secondHost.id]).toContain(row.hostId);
    const expected = [host.id, secondHost.id].sort()[0];
    expect(row.hostId).toBe(expected);

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
