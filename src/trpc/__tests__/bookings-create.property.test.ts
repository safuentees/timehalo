import { describe, beforeAll, beforeEach, afterAll, expect } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

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
