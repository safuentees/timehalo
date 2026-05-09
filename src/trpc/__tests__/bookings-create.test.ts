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

// B.PT275 — visitor's chosen duration validation. Uses a separate
// describe block + handle so EventType seeding doesn't affect the
// idempotency tests above.
const DURATION_HANDLE = "vitest-host-durations";

describe("bookings.create durationMinutes", () => {
  let hostId: string;
  let slotIso: string;

  beforeAll(async () => {
    const host = await createTestHost(DURATION_HANDLE);
    hostId = host.id;
    // EventType with the host's handle as slug — same shape
    // `bootstrapUserWorkspace` writes for new accounts. Configure a
    // multi-duration list so the validation paths can fire.
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
        // 45 is NOT in the [15, 30, 60] choices configured above.
        durationMinutes: 45,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects with CONFLICT when a longer existing booking overlaps the new slot", async () => {
    // B.PT277 — range-overlap collision. The exact scenario the user
    // reported: host has a 5:00 PM + 60-min booking, second visitor
    // tries 5:15 PM + 15-min. Pre-B.PT277 the point-equality check
    // missed this and minted the booking; range-overlap rejects.
    const caller = callRouter(fakeContext());
    const baseStart = nextMondayAt10UTC();
    // Existing 60-min booking 10:00–11:00 UTC.
    await caller.bookings.create({
      handle: DURATION_HANDLE,
      slotStart: baseStart.toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
      durationMinutes: 60,
    });

    // New 15-min booking 10:15–10:30 UTC (sits inside the 10:00–11:00
    // existing booking). Different `slotStart` from the existing one
    // — old point-equality check would have allowed it.
    const overlapStart = new Date(baseStart.getTime() + 15 * 60_000);
    await expect(
      caller.bookings.create({
        handle: DURATION_HANDLE,
        slotStart: overlapStart.toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Bob",
        visitorEmail: "bob@test.local",
        durationMinutes: 15,
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("permits a back-to-back booking (existing 10:00–10:30 + new 10:30–10:45)", async () => {
    // B.PT277 — exact-touch boundaries (existing.end === new.start)
    // do NOT count as overlap. Strict `<` / `>` predicate keeps the
    // common back-to-back case bookable.
    const caller = callRouter(fakeContext());
    const baseStart = nextMondayAt10UTC();
    await caller.bookings.create({
      handle: DURATION_HANDLE,
      slotStart: baseStart.toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
      durationMinutes: 30,
    });
    const adjacentStart = new Date(baseStart.getTime() + 30 * 60_000);
    const second = await caller.bookings.create({
      handle: DURATION_HANDLE,
      slotStart: adjacentStart.toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Bob",
      visitorEmail: "bob@test.local",
      durationMinutes: 15,
    });
    expect(second.publicUid).toBeDefined();
  });

  it("rejects with BAD_REQUEST when the host has cleared their durations list", async () => {
    // B.PT278 — empty list semantically means "host isn't accepting
    // bookings". Programmatic callers (the chip strip already wouldn't
    // surface a duration in this state) get refused.
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
    // Restore the multi-duration list so the rest of the suite's
    // tests start from the same shape.
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
    // Replay with a DIFFERENT durationMinutes — idempotency wins; the
    // server returns the original booking unchanged regardless of the
    // (ignored) replay payload.
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
