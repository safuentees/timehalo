import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { TASK_TYPE_EMAIL_SEND, type EmailSendPayload } from "@/lib/tasks";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// A7 — bookings.reschedule contract.
// Verifies: slot swap atomicity, audit chain via operationId,
// idempotency, slot collision, original soft-deleted, new row
// links via rescheduledFromUid.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-reschedule";

describe("bookings.reschedule", () => {
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

  async function makeBooking(slotMinuteOffset: number) {
    const caller = callRouter(fakeContext({}));
    return caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(slotMinuteOffset).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
  }

  it("swaps the booking — old is soft-deleted, new links via rescheduledFromUid", async () => {
    const original = await makeBooking(0);

    const caller = callRouter(fakeContext({}));
    const newKey = crypto.randomUUID();
    const result = await caller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(30).toISOString(),
      idempotencyKey: newKey,
    });

    expect(result.publicUid).not.toBe(original.publicUid);
    expect(result.handle).toBe(host.handle);

    // Old row soft-deleted, idempotencyKey nulled.
    const oldRow = await prisma.booking.findUnique({
      where: { publicUid: original.publicUid },
      select: {
        deleted: true,
        deletedAt: true,
        idempotencyKey: true,
      },
    });
    expect(oldRow?.deleted).toBe(true);
    expect(oldRow?.deletedAt).not.toBeNull();
    expect(oldRow?.idempotencyKey).toBeNull();

    // New row points back at the old uid + carries the idempotencyKey.
    const newRow = await prisma.booking.findUnique({
      where: { publicUid: result.publicUid },
      select: {
        deleted: true,
        rescheduledFromUid: true,
        idempotencyKey: true,
        slotStart: true,
      },
    });
    expect(newRow?.deleted).toBe(false);
    expect(newRow?.rescheduledFromUid).toBe(original.publicUid);
    expect(newRow?.idempotencyKey).toBe(newKey);
  });

  it("writes both audit rows under the same operationId", async () => {
    const original = await makeBooking(0);
    const caller = callRouter(fakeContext({}));
    const result = await caller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(45).toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });

    const fromAudit = await prisma.bookingAudit.findFirst({
      where: { bookingUid: original.publicUid, action: "RESCHEDULED_FROM" },
      select: { operationId: true },
    });
    const toAudit = await prisma.bookingAudit.findFirst({
      where: { bookingUid: result.publicUid, action: "RESCHEDULED_TO" },
      select: { operationId: true },
    });
    expect(fromAudit).not.toBeNull();
    expect(toAudit).not.toBeNull();
    expect(fromAudit?.operationId).toBe(toAudit?.operationId);
  });

  it("rejects rescheduling to the same slot", async () => {
    const original = await makeBooking(0);
    const caller = callRouter(fakeContext({}));
    await expect(
      caller.bookings.reschedule({
        oldPublicUid: original.publicUid,
        newSlotStart: tomorrowAtMinute(0).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects when the new slot is already taken", async () => {
    await makeBooking(0); // takes slot 0
    const original = await makeBooking(15); // takes slot 15

    const caller = callRouter(fakeContext({}));
    await expect(
      caller.bookings.reschedule({
        oldPublicUid: original.publicUid,
        newSlotStart: tomorrowAtMinute(0).toISOString(), // collides
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/grabbed that slot|CONFLICT/i);
  });

  it("rejects unknown old uid", async () => {
    const caller = callRouter(fakeContext({}));
    await expect(
      caller.bookings.reschedule({
        oldPublicUid: "not-a-real-uid",
        newSlotStart: tomorrowAtMinute(0).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("idempotency: second call with same key returns the same row", async () => {
    const original = await makeBooking(0);
    const caller = callRouter(fakeContext({}));
    const key = crypto.randomUUID();
    const first = await caller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(45).toISOString(),
      idempotencyKey: key,
    });
    const second = await caller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(60).toISOString(),
      idempotencyKey: key,
    });
    expect(second.publicUid).toBe(first.publicUid);
  });

  it("enqueues a booking-rescheduled email to the visitor", async () => {
    const original = await makeBooking(0);
    await prisma.task.deleteMany({}); // wipe create-side email task

    const caller = callRouter(fakeContext({}));
    const result = await caller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: tomorrowAtMinute(30).toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });

    const tasks = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: { payload: true },
    });
    const reschedTask = tasks.find((t) => {
      const p = JSON.parse(t.payload) as EmailSendPayload;
      return p.template === "booking-rescheduled";
    });
    expect(reschedTask).toBeDefined();
    if (!reschedTask) return;
    const payload = JSON.parse(reschedTask.payload) as EmailSendPayload;
    expect(payload.to).toBe("maya@example.com");
    expect(payload.template).toBe("booking-rescheduled");

    // Discriminated-union narrowing through generics doesn't reach
    // through `payload.props` here, so cast to the known shape — the
    // runtime payload is JSON, the registry guarantees the field set.
    const props = payload.props as {
      oldSlotStartIso: string;
      newSlotStartIso: string;
    };
    expect(props.oldSlotStartIso).toBe(
      new Date(original.slotStart as unknown as string).toISOString(),
    );
    expect(props.newSlotStartIso).toBe(
      tomorrowAtMinute(30).toISOString(),
    );
    expect(result.publicUid).toBeTruthy();
  });
});
