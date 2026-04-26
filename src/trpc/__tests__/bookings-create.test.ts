import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";

// Tests for §10.1 item 1 — booking idempotency. Uses tRPC v11's
// createCallerFactory to call procedures directly with no HTTP layer
// and a synthetic context. The tests hit the real dev.db (vitest
// config runs serially via singleFork), so beforeEach wipes anything
// left over from previous runs.
//
// Each test asserts ONE property of the contract:
//   - idempotency: same key → same booking
//   - slot collision: same slot, different keys → CONFLICT
//   - race protection: 3 parallel submits → 1 row, 3 identical responses
//
// To exercise the soft-delete-aware idempotency lookup later, add a
// fourth test: cancel a booking, retry with the original key →
// expect a NEW booking (the old one's idempotencyKey was nulled out
// on cancel, so the lookup misses).

const callRouter = createCaller(appRouter);

const TEST_HANDLE = "vitest-host";

function createTestContext() {
  return {
    user: null,
    // Unique IP per test invocation so the rate limiter (10/min/IP)
    // doesn't carry state between tests in the same process.
    ipIdentifier: `test:${crypto.randomUUID()}`,
    cookies: new Map<string, string>(),
  };
}

/** Next Monday at 10:00 UTC — far enough in the future that any
 *  test run that takes minutes won't fall behind it. */
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
    // Drop any leftover host from a previous failed run.
    await prisma.user.deleteMany({ where: { handle: TEST_HANDLE } });

    const host = await prisma.user.create({
      data: {
        email: `vitest-${Date.now()}@test.local`,
        handle: TEST_HANDLE,
        availabilityRanges: {
          create: [
            // Wide-open Monday so any 15-min slot starting on a
            // quarter-hour validates against generateUpcomingSlots.
            {
              dayOfWeek: "MONDAY",
              startTime: "00:00",
              endTime: "23:45",
            },
          ],
        },
      },
    });
    hostId = host.id;
    slotIso = nextMondayAt10UTC().toISOString();
  });

  beforeEach(async () => {
    // Clean per-test state: bookings + audit. Leave the host + ranges
    // alone (set up once in beforeAll, used by every test).
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
  });

  afterAll(async () => {
    // Tidy up so the next `pnpm test` run starts clean.
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
    await prisma.user.deleteMany({ where: { id: hostId } });
    await prisma.$disconnect();
  });

  it("returns the same booking when called twice with the same key", async () => {
    const caller = callRouter(createTestContext());
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
    const caller = callRouter(createTestContext());
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

    // Different key → not deduped → falls through to slot-uniqueness
    // check inside the bookings.create transaction → CONFLICT.
    await expect(
      caller.bookings.create({
        ...baseInput,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("survives 3 concurrent submits with the same key (race protection)", async () => {
    const caller = callRouter(createTestContext());
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
    const caller = callRouter(createTestContext());
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
    // Idempotency hit returns BEFORE writing a new audit row, so even
    // 3 calls produce a single CREATED audit. Verifies the §10.1 item 1
    // + item 2 contracts compose correctly.
    expect(audits.length).toBe(1);
  });
});
