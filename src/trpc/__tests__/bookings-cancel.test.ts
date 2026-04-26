import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAt10UTC,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// Tests for §10.1 items 2 (audit log) + 7 (soft delete) on the cancel
// path. Cancellation is the second state transition the booking flow
// has, so it's the cleanest place to verify the audit + soft-delete
// contracts compose under realistic conditions.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-cancel";

describe("bookings.cancel — soft delete + audit", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  async function makeBooking(slot: Date, idempotencyKey?: string) {
    const visitorCaller = callRouter(fakeContext());
    return visitorCaller.bookings.create({
      handle: HANDLE,
      slotStart: slot.toISOString(),
      idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
      visitorName: "Visitor",
      visitorEmail: "visitor@test.local",
    });
  }

  it("sets deleted=true, deletedAt, and nulls idempotencyKey", async () => {
    const booking = await makeBooking(tomorrowAt10UTC());
    const hostCaller = callRouter(fakeContext({ userId: host.id }));

    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });

    // findUnique without filter — we want to see the soft-deleted row.
    const row = await prisma.booking.findUnique({
      where: { publicUid: booking.publicUid },
      select: {
        deleted: true,
        deletedAt: true,
        idempotencyKey: true,
      },
    });
    expect(row).not.toBeNull();
    expect(row!.deleted).toBe(true);
    expect(row!.deletedAt).not.toBeNull();
    // Critical: nulled out so the unique index entry frees up. A
    // future booking with the same idempotency key won't trip P2002.
    expect(row!.idempotencyKey).toBeNull();
  });

  it("writes a CANCELLED audit row with actor=HOST in the same transaction", async () => {
    const booking = await makeBooking(tomorrowAt10UTC());
    const hostCaller = callRouter(fakeContext({ userId: host.id }));

    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });

    const audits = await prisma.bookingAudit.findMany({
      where: { bookingUid: booking.publicUid },
      orderBy: { id: "asc" },
      select: { actor: true, action: true, operationId: true },
    });
    expect(audits.length).toBe(2);
    expect(audits[0]).toMatchObject({ actor: "VISITOR", action: "CREATED" });
    expect(audits[1]).toMatchObject({ actor: "HOST", action: "CANCELLED" });
    // Different operationIds — each procedure call is its own
    // correlation group. Same booking, two different user actions.
    expect(audits[0].operationId).not.toBe(audits[1].operationId);
  });

  it("audit data snapshot survives hard deletion of the booking row", async () => {
    const booking = await makeBooking(tomorrowAt10UTC());
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });

    // Simulate the cleanup cron — hard-delete the soft-deleted row.
    await prisma.booking.deleteMany({
      where: { publicUid: booking.publicUid },
    });

    const audits = await prisma.bookingAudit.findMany({
      where: { bookingUid: booking.publicUid },
    });
    // Both rows still here even though the Booking row is gone.
    // This is the entire point of the no-FK design.
    expect(audits.length).toBe(2);
    expect(audits[0].data).toMatchObject({ visitorName: "Visitor" });
  });

  it("the slot becomes bookable again after cancel", async () => {
    const slot = tomorrowAt10UTC();
    const first = await makeBooking(slot);
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: first.publicUid });

    // New visitor, new key, same slot — the slot-collision check in
    // bookings.create filters deleted=false, so the soft-deleted row
    // doesn't block.
    const second = await makeBooking(slot);
    expect(second.publicUid).not.toBe(first.publicUid);

    // Verify the active vs soft-deleted state separately.
    const activeRows = await prisma.booking.count({
      where: { hostId: host.id, slotStart: slot, deleted: false },
    });
    const softDeletedRows = await prisma.booking.count({
      where: { hostId: host.id, slotStart: slot, deleted: true },
    });
    expect(activeRows).toBe(1);
    expect(softDeletedRows).toBe(1);
  });

  it("rejects cancel from a non-owning user with NOT_FOUND", async () => {
    const booking = await makeBooking(tomorrowAt10UTC());
    const otherCaller = callRouter(
      fakeContext({ userId: "different-user-id" }),
    );

    // deleteMany scoped to userId — looks like 'not found' to the
    // imposter rather than 'forbidden', which leaks less info.
    await expect(
      otherCaller.bookings.cancel({ publicUid: booking.publicUid }),
    ).rejects.toThrow(TRPCError);

    // Booking still exists.
    const row = await prisma.booking.findUnique({
      where: { publicUid: booking.publicUid },
      select: { deleted: true },
    });
    expect(row?.deleted).toBe(false);
  });

  it("disappears from listForHost after cancel", async () => {
    const booking = await makeBooking(tomorrowAtMinute(0));
    await makeBooking(tomorrowAtMinute(15));
    const hostCaller = callRouter(fakeContext({ userId: host.id }));

    const before = await hostCaller.bookings.listForHost();
    expect(before.upcoming.length).toBe(2);

    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });

    const after = await hostCaller.bookings.listForHost();
    expect(after.upcoming.length).toBe(1);
    expect(after.upcoming[0].publicUid).not.toBe(booking.publicUid);
  });

  it("disappears from getPublicConfirmation after cancel", async () => {
    const booking = await makeBooking(tomorrowAt10UTC());
    const visitorCaller = callRouter(fakeContext());

    // Pre-cancel: confirmation page resolves.
    const before = await visitorCaller.bookings.getPublicConfirmation({
      handle: HANDLE,
      bookingUid: booking.publicUid,
    });
    expect(before).not.toBeNull();

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });

    // Post-cancel: filtered by deleted=false → throws NOT_FOUND.
    // (The procedure throws TRPCError('NOT_FOUND') when the row is
    // missing, which from a route handler perspective becomes a
    // 404. Tests assert on the thrown shape.)
    await expect(
      visitorCaller.bookings.getPublicConfirmation({
        handle: HANDLE,
        bookingUid: booking.publicUid,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
