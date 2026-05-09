import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestEventTypeHostPool,
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);

const TEST_HANDLE = "vitest-host";

function nextMondayAt10UTC(): Date {
  const d = new Date();
  const offset = ((1 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

describe("bookings.create idempotency", () => {
  let hostId: string;
  let slotIso: string;

  beforeAll(async () => {
    const host = await createTestHost(TEST_HANDLE);
    hostId = host.id;
    slotIso = nextMondayAt10UTC().toISOString();
  });

  beforeEach(async () => {
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
  });

  afterAll(async () => {
    await tearDownTestHost(hostId);
  });

  it("returns the same booking when called twice with the same key", async () => {
    const caller = callRouter(fakeContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    const first = await caller.bookings.create(input);
    const second = await caller.bookings.create(input);

    expect(first.publicUid).toBe(second.publicUid);

    const count = await prisma.booking.count({
      where: { idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it("rejects with CONFLICT when same slot but different key", async () => {
    const caller = callRouter(fakeContext());
    const baseInput = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    await caller.bookings.create({
      ...baseInput,
      idempotencyKey: crypto.randomUUID(),
    });

    await expect(
      caller.bookings.create({
        ...baseInput,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("survives 3 concurrent submits with the same key (race protection)", async () => {
    const caller = callRouter(fakeContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    const [a, b, c] = await Promise.all([
      caller.bookings.create(input),
      caller.bookings.create(input),
      caller.bookings.create(input),
    ]);

    expect(a.publicUid).toBe(b.publicUid);
    expect(b.publicUid).toBe(c.publicUid);

    const count = await prisma.booking.count({
      where: { idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it("writes one CREATED audit row per successful booking, none for retries", async () => {
    const caller = callRouter(fakeContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    await caller.bookings.create(input);
    await caller.bookings.create(input); // retry, should short-circuit
    await caller.bookings.create(input); // another retry

    const audits = await prisma.bookingAudit.findMany({
      where: { action: "CREATED" },
    });
    expect(audits.length).toBe(1);
  });

  it("writes the host's primary workspaceId on the booking row", async () => {
    const caller = callRouter(fakeContext());
    const idempotencyKey = crypto.randomUUID();
    await caller.bookings.create({
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    });

    const row = await prisma.booking.findFirstOrThrow({
      where: { idempotencyKey },
      select: { workspaceId: true, hostId: true },
    });
    const primary = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: row.hostId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    expect(row.workspaceId).toBe(primary.id);
  });
});

const DURATION_HANDLE = "vitest-host-durations";

describe("bookings.create durationMinutes", () => {
  let hostId: string;
  let slotIso: string;

  beforeAll(async () => {
    const host = await createTestHost(DURATION_HANDLE);
    hostId = host.id;
    await createTestEventTypeHostPool({
      hostHandle: DURATION_HANDLE,
      members: [{ userId: host.id, isFixed: true }],
    });
    await prisma.eventType.updateMany({
      where: { slug: DURATION_HANDLE },
      data: { durationMinsList: JSON.stringify([15, 30, 60]) },
    });
    slotIso = nextMondayAt10UTC().toISOString();
  });

  beforeEach(async () => {
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
  });

  afterAll(async () => {
    await tearDownTestHost(hostId);
  });

  it("falls back to EventType.durationMins when no duration is sent", async () => {
    const caller = callRouter(fakeContext());
    await caller.bookings.create({
      handle: DURATION_HANDLE,
      slotStart: slotIso,
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    });
    const row = await prisma.booking.findFirstOrThrow({
      where: { hostId },
      select: { slotStart: true, slotEnd: true },
    });
    const minutes =
      (row.slotEnd.getTime() - row.slotStart.getTime()) / 60_000;
    expect(minutes).toBe(15);
  });

  it("uses the visitor's pick when it sits in the configured choices", async () => {
    const caller = callRouter(fakeContext());
    await caller.bookings.create({
      handle: DURATION_HANDLE,
      slotStart: slotIso,
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
      durationMinutes: 30,
    });
    const row = await prisma.booking.findFirstOrThrow({
      where: { hostId },
      select: { slotStart: true, slotEnd: true },
    });
    const minutes =
      (row.slotEnd.getTime() - row.slotStart.getTime()) / 60_000;
    expect(minutes).toBe(30);
  });

  it("rejects a duration that isn't in the configured choices", async () => {
    const caller = callRouter(fakeContext());
    await expect(
      caller.bookings.create({
        handle: DURATION_HANDLE,
        slotStart: slotIso,
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Alice",
        visitorEmail: "alice@test.local",
        durationMinutes: 45,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects with BAD_REQUEST when the host has cleared their durations list", async () => {
    await prisma.eventType.updateMany({
      where: { slug: DURATION_HANDLE },
      data: { durationMinsList: "[]" },
    });
    const caller = callRouter(fakeContext());
    await expect(
      caller.bookings.create({
        handle: DURATION_HANDLE,
        slotStart: slotIso,
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Alice",
        visitorEmail: "alice@test.local",
      }),
    ).rejects.toThrow(TRPCError);
    await prisma.eventType.updateMany({
      where: { slug: DURATION_HANDLE },
      data: { durationMinsList: JSON.stringify([15, 30, 60]) },
    });
  });

  it("idempotency replay preserves the original duration", async () => {
    const caller = callRouter(fakeContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: DURATION_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
      durationMinutes: 60,
    };
    const first = await caller.bookings.create(input);
    const second = await caller.bookings.create({
      ...input,
      durationMinutes: 15,
    });
    expect(first.publicUid).toBe(second.publicUid);
    const row = await prisma.booking.findFirstOrThrow({
      where: { idempotencyKey },
      select: { slotStart: true, slotEnd: true },
    });
    const minutes =
      (row.slotEnd.getTime() - row.slotStart.getTime()) / 60_000;
    expect(minutes).toBe(60);
  });
});
