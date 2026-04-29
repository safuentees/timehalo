import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { createTestHost, fakeContext, tearDownTestHost } from "../../../test/fixtures";

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

// `fakeContext()` from test/fixtures.ts is the canonical synthetic
// context. It already gives every call a unique ipIdentifier so the
// rate limiter (10/min/IP) never carries state across tests in the
// same process.

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
    const host = await createTestHost(TEST_HANDLE);
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
    // Idempotency hit returns BEFORE writing a new audit row, so even
    // 3 calls produce a single CREATED audit. Verifies the §10.1 item 1
    // + item 2 contracts compose correctly.
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

    // The booking row should carry the host's oldest owned Workspace.
    // Pulling both the row's workspaceId and the host's primary
    // workspace independently and asserting equality keeps the test
    // honest — neither side is hard-coded.
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
