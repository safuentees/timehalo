import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  createTestBooking,
  createTestBookingAudit,
  createTestWebhookSubscription,
  tearDownTestHost,
  tomorrowAtMinute,
} from "../../../test/fixtures";

describe("createTestUser", () => {
  let userId: string | undefined;
  afterEach(async () => {
    if (userId) await tearDownTestHost(userId);
    userId = undefined;
  });

  it("creates a user without availability ranges", async () => {
    const user = await createTestUser("vitest-factory-user");
    userId = user.id;
    expect(user.handle).toBe("vitest-factory-user");
    const ranges = await prisma.availabilityRange.count({
      where: { userId: user.id },
    });
    expect(ranges).toBe(0);
  });

  it("accepts name + timezone overrides", async () => {
    const user = await createTestUser("vitest-factory-user-2", {
      name: "Alex",
      timezone: "America/New_York",
    });
    userId = user.id;
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, timezone: true },
    });
    expect(row.name).toBe("Alex");
    expect(row.timezone).toBe("America/New_York");
  });
});

describe("createTestBooking + createTestWebhookSubscription + createTestBookingAudit", () => {
  let userId: string | undefined;
  afterEach(async () => {
    if (userId) await tearDownTestHost(userId);
    userId = undefined;
  });

  it("createTestBooking inserts a 15-min slot at the supplied start", async () => {
    const user = await createTestUser("vitest-factory-booking");
    userId = user.id;

    const slotStart = tomorrowAtMinute(0);
    const booking = await createTestBooking({
      hostId: user.id,
      slotStart,
    });

    expect(booking.slotEnd.getTime() - booking.slotStart.getTime()).toBe(
      15 * 60_000,
    );
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { visitorName: true, deleted: true },
    });
    expect(row.deleted).toBe(false);
    expect(row.visitorName).toBe("Test Visitor");
  });

  it("createTestBooking honors deleted + deletedAt overrides", async () => {
    const user = await createTestUser("vitest-factory-soft");
    userId = user.id;
    const ago = new Date(Date.now() - 86_400_000);
    const booking = await createTestBooking({
      hostId: user.id,
      slotStart: tomorrowAtMinute(0),
      deleted: true,
      deletedAt: ago,
    });
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { deleted: true, deletedAt: true },
    });
    expect(row.deleted).toBe(true);
    expect(row.deletedAt?.getTime()).toBe(ago.getTime());
  });

  it("createTestWebhookSubscription stores the events CSV", async () => {
    const user = await createTestUser("vitest-factory-wh");
    userId = user.id;
    const sub = await createTestWebhookSubscription({
      userId: user.id,
      events: ["booking.created", "booking.cancelled"],
    });
    const row = await prisma.webhookSubscription.findUniqueOrThrow({
      where: { id: sub.id },
      select: { events: true, active: true },
    });
    expect(row.events).toBe("booking.created,booking.cancelled");
    expect(row.active).toBe(true);
  });

  it("createTestBookingAudit accepts arbitrary bookingUid (no FK)", async () => {
    const audit = await createTestBookingAudit({
      bookingUid: "ghost-booking-uid",
      action: "CREATED",
      data: { hostId: "fake" },
    });
    const row = await prisma.bookingAudit.findUniqueOrThrow({
      where: { id: audit.id },
      select: { bookingUid: true, action: true, operationId: true },
    });
    expect(row.bookingUid).toBe("ghost-booking-uid");
    expect(row.action).toBe("CREATED");
    expect(row.operationId).toBe(audit.operationId);
    await prisma.bookingAudit.delete({ where: { id: audit.id } });
  });
});
