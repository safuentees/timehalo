import { describe, beforeAll, beforeEach, afterAll, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

// B.PT86 — reference property-based contract test (resolves QA-7).
//
// The companion playbook lives at `docs/edge-case-testing.md`. This
// file demonstrates the pattern; new property tests follow the same
// shape (one file per invariant, fixture setup in beforeAll, narrow
// invariant statement, generators chosen so shrinking lands on a
// useful repro).
//
// The invariant under test: `bookings.create` is idempotent across
// arbitrary concurrent-submit counts. The existing
// `bookings-create.test.ts` already covers the canonical 1, 2, and
// 3-concurrent-submit cases as example-based tests; this file extends
// the same contract to "for any N in [2, 8] and any v4 UUID K, after
// N parallel submits with key K, exactly one Booking row exists and
// every response shares publicUid." If the contract ever regresses
// (e.g. someone moves the inside-tx idempotency lookup outside the
// transaction — the change `c2fe653` reverted), fast-check will
// shrink to the minimum N + key shape that exposes the race.
//
// Generator choices, deliberately:
//   - fc.uuid({ version: 4 }) — matches the runtime shape produced by
//     `crypto.randomUUID()` in the booking form. Other versions are
//     accepted by the schema but not produced in practice; fuzzing
//     them would expose schema validation, not the idempotency race.
//   - fc.integer({ min: 2, max: 8 }) — N=1 is the trivial case (the
//     existing example test covers it); N>8 is bounded by the rate
//     limiter (10/min/IP) and would flake the test, not the contract.
//   - Visitor name / email re-randomized per case so two property
//     iterations don't collide on a deterministic-IP visitor and
//     trip the rate limit (fakeContext() already mints unique IPs
//     per call, but property iterations all share ONE caller).
//
// Test cost: 50 default iterations × N concurrent submits + DB wipe
// in beforeEach. Capped via `numRuns: 25` to keep total under ~5s
// (the suite is gated on workers=1 so this directly extends wall
// time). Increase `numRuns` if a regression slips through; decrease
// if test wall time becomes a real constraint.

const callRouter = createCaller(appRouter);
const TEST_HANDLE = "vitest-property-bookings";

function tomorrowAt10UTC(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

describe("bookings.create — property-based idempotency invariant", () => {
  let hostId: string;
  let slotIso: string;

  beforeAll(async () => {
    const host = await createTestHost(TEST_HANDLE);
    hostId = host.id;
    slotIso = tomorrowAt10UTC().toISOString();
  });

  beforeEach(async () => {
    // Per-iteration cleanup. fast-check runs the property body N
    // times in the same Vitest test, so beforeEach fires ONCE before
    // the property block — but the property body itself wipes
    // bookings inside the loop (see the explicit `prisma.booking.
    // deleteMany` below). Without that, iteration K+1's submits land
    // on iteration K's row and the count assertion drifts.
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
  });

  afterAll(async () => {
    await tearDownTestHost(hostId);
  });

  test.prop(
    {
      idempotencyKey: fc.uuid({ version: 4 }),
      submitCount: fc.integer({ min: 2, max: 8 }),
    },
    { numRuns: 25 },
  )(
    "for any uuid K + N in [2, 8], all N parallel submits return the same booking and exactly one row exists",
    async ({ idempotencyKey, submitCount }) => {
      // Per-iteration DB wipe so iteration N+1 starts clean. The
      // describe-level beforeEach handles the FIRST iteration; this
      // handles the rest.
      await prisma.bookingAudit.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.booking.deleteMany({ where: { hostId } });

      const caller = callRouter(fakeContext());
      const input = {
        handle: TEST_HANDLE,
        slotStart: slotIso,
        idempotencyKey,
        visitorName: "Property Test",
        visitorEmail: `prop-${idempotencyKey.slice(0, 8)}@test.local`,
      };

      const responses = await Promise.all(
        Array.from({ length: submitCount }, () =>
          caller.bookings.create(input),
        ),
      );

      const uids = new Set(responses.map((r) => r.publicUid));
      expect(uids.size, "all responses must share publicUid").toBe(1);

      const rowCount = await prisma.booking.count({
        where: { idempotencyKey },
      });
      expect(rowCount, "exactly one Booking row per idempotency key").toBe(1);
    },
  );
});
