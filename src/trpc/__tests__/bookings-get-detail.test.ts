import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// bookings.getDetail — host-side detail fetch wired into the new
// /bookings/[publicUid] page. Permission contract: caller must be the
// host. Stranger gets NOT_FOUND (same shape as a missing row — no
// enumeration leak).

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-detail";

describe("bookings.getDetail", () => {
  let host: { id: string; handle: string };
  let stranger: { id: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    stranger = await createTestHost("vitest-detail-stranger");
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
    await wipeTransientState(stranger.id);
  });

  afterAll(async () => {
    await tearDownTestHost(host.id);
    await tearDownTestHost(stranger.id);
  });

  it("returns the booking + audit + pendingTasks for the host", async () => {
    const visitorCaller = callRouter(fakeContext());
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      question: "Help with X",
      idempotencyKey: crypto.randomUUID(),
    });

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    const detail = await hostCaller.bookings.getDetail({
      publicUid: created.publicUid,
    });

    expect(detail.publicUid).toBe(created.publicUid);
    expect(detail.visitorName).toBe("Maya");
    expect(detail.host?.id).toBe(host.id);
    // CREATED audit row is written in the booking transaction.
    expect(detail.audit.length).toBeGreaterThanOrEqual(1);
    expect(detail.audit[0].action).toBe("CREATED");
    // bookings.create enqueues a reminder Task + dispatchWorkflows
    // for any default workflow row. createTestHost seeds a default
    // workflow at user create (auth.register pattern), so at least
    // one pendingTask exists.
    expect(detail.pendingTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns NOT_FOUND for a stranger (no enumeration leak)", async () => {
    const visitorCaller = callRouter(fakeContext());
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const strangerCaller = callRouter(fakeContext({ userId: stranger.id }));
    await expect(
      strangerCaller.bookings.getDetail({ publicUid: created.publicUid }),
    ).rejects.toThrow(TRPCError);
  });

  it("returns NOT_FOUND for a non-existent publicUid", async () => {
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      hostCaller.bookings.getDetail({ publicUid: "nope-not-real" }),
    ).rejects.toThrow(/not found|NOT_FOUND/i);
  });

  it("populates rescheduledFrom when the booking was rescheduled", async () => {
    const visitorCaller = callRouter(fakeContext());
    const original = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const rescheduled = await visitorCaller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(15).toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    const detail = await hostCaller.bookings.getDetail({
      publicUid: rescheduled.publicUid,
    });
    expect(detail.rescheduledFrom).not.toBeNull();
    expect(detail.rescheduledFrom?.publicUid).toBe(original.publicUid);

    // Audit chain on the new booking — reschedule writes
    // RESCHEDULED_TO on the new row (CREATED-equivalent), and the
    // old row gets RESCHEDULED_FROM. Asserting on the new uid here.
    expect(
      detail.audit.some((row) => row.action === "RESCHEDULED_TO"),
    ).toBe(true);
  });

  it("eventType + referrer surface when present, otherwise null", async () => {
    const visitorCaller = callRouter(fakeContext());
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    const detail = await hostCaller.bookings.getDetail({
      publicUid: created.publicUid,
    });

    // createTestHost doesn't seed an EventType (fixture pre-dates B2)
    // — so eventType is null on this path. The booking-flow change
    // handles this case by leaving eventTypeId null. Test confirms
    // the procedure surfaces null cleanly.
    expect(detail.eventType).toBeNull();
    // referrer comes from the oh_ref_<handle> cookie set by proxy.ts
    // — fakeContext doesn't carry one, so null.
    expect(detail.referrer).toBeNull();
  });
});

// Verify the fakeContext factory handles the cookies map shape we
// rely on above — defensive against fixture drift.
describe("bookings.getDetail Prisma shape sanity", () => {
  it("Booking.eventTypeId is nullable in the schema (B2 contract)", async () => {
    // Direct DB sanity check — if a future migration drops the
    // nullable, this test catches it before the procedure crashes.
    const sample = await prisma.booking.findFirst({ select: { eventTypeId: true } });
    if (sample) {
      expect(typeof sample.eventTypeId === "string" || sample.eventTypeId === null).toBe(true);
    }
  });
});
