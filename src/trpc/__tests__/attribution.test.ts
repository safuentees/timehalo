import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-attribution";

describe("attribution — ?ref cookie threads through to Booking.referrer", () => {
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

  function input(slot: Date) {
    return {
      handle: HANDLE,
      slotStart: slot.toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Visitor",
      visitorEmail: "v@test.local",
    };
  }

  it("stamps Booking.referrer when oh_ref_<handle> cookie is present", async () => {
    const cookies = new Map<string, string>([
      [`oh_ref_${HANDLE}`, "twitter"],
    ]);
    const caller = callRouter(fakeContext({ cookies }));

    const booking = await caller.bookings.create(input(tomorrowAtMinute(0)));

    const row = await prisma.booking.findUnique({
      where: { publicUid: booking.publicUid },
      select: { referrer: true },
    });
    expect(row?.referrer).toBe("twitter");
  });

  it("stores referrer=null when no cookie is present", async () => {
    const caller = callRouter(fakeContext()); // empty cookies map

    const booking = await caller.bookings.create(input(tomorrowAtMinute(15)));

    const row = await prisma.booking.findUnique({
      where: { publicUid: booking.publicUid },
      select: { referrer: true },
    });
    expect(row?.referrer).toBeNull();
  });

  it("ignores cookies for other handles (namespace isolation)", async () => {
    const cookies = new Map<string, string>([
      ["oh_ref_someotherhost", "twitter"],
    ]);
    const caller = callRouter(fakeContext({ cookies }));

    const booking = await caller.bookings.create(input(tomorrowAtMinute(30)));

    const row = await prisma.booking.findUnique({
      where: { publicUid: booking.publicUid },
      select: { referrer: true },
    });
    expect(row?.referrer).toBeNull();
  });

  it("propagates referrer into the BookingAudit data snapshot", async () => {
    const cookies = new Map<string, string>([
      [`oh_ref_${HANDLE}`, "newsletter-jul"],
    ]);
    const caller = callRouter(fakeContext({ cookies }));

    const booking = await caller.bookings.create(input(tomorrowAtMinute(45)));

    const audit = await prisma.bookingAudit.findFirstOrThrow({
      where: { bookingUid: booking.publicUid, action: "CREATED" },
      select: { data: true },
    });
    expect(audit.data).toMatchObject({ referrer: "newsletter-jul" });
  });
});
