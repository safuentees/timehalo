import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { generateUpcomingSlots } from "@/lib/schedule";
import {
  isValidTimezone,
  normalizeIanaId,
  resolveTimezone,
  timezoneSchema,
} from "@/lib/timezone";
import { DayOfWeek } from "@/generated/prisma/enums";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-timezone";

// Tests for A3 — IANA validation + DST-aware slot generation.

describe("timezone — validation + normalization", () => {
  it("accepts a canonical IANA zone unchanged", () => {
    expect(resolveTimezone("America/New_York")).toBe("America/New_York");
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("normalizes Kiev → Kyiv via the override map", () => {
    expect(normalizeIanaId("Europe/Kiev")).toBe("Europe/Kyiv");
  });

  it("returns null for nonsense", () => {
    expect(resolveTimezone("Not/A/Zone")).toBeNull();
    expect(resolveTimezone("America/SomethingFake")).toBeNull();
    expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
  });

  it("zod schema rejects fixed-offset zones", () => {
    expect(() => timezoneSchema.parse("Etc/GMT-5")).toThrow();
  });

  it("zod schema accepts a real geographic zone", () => {
    expect(timezoneSchema.parse("America/Los_Angeles")).toBe(
      "America/Los_Angeles",
    );
  });

  it("zod schema accepts UTC", () => {
    expect(timezoneSchema.parse("UTC")).toBe("UTC");
  });
});

describe("generateUpcomingSlots — DST-aware host timezone", () => {
  // Pin Date.now() to the US "spring forward" Sunday cusp so any future
  // refactor that accidentally references the system clock (instead of
  // the explicit `from`) breaks here, not on a passing CI dev box on
  // some other day of the year. The current implementation uses only
  // the explicit `from` arg, so this is belt-and-braces — but the
  // pin is the contract and we want it written down.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T07:00:00Z")); // DST cusp, NY
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // March 8 2026 is the US "spring forward" Sunday → 02:00 doesn't
  // exist in America/New_York; clocks jump to 03:00. A 09:00 wall-clock
  // slot maps to 13:00 UTC after DST starts (was 14:00 UTC in standard
  // time the prior week).
  it("respects DST transitions when host is America/New_York", () => {
    // Pin from to a Friday well before DST so the 7-day window
    // brackets the boundary.
    const from = new Date("2026-03-06T05:00:00Z"); // Fri, 00:00 EST

    const ranges = [
      // Saturday 9am-10am (before DST = 14:00 UTC)
      { dayOfWeek: DayOfWeek.SATURDAY, startTime: "09:00", endTime: "10:00" },
      // Monday 9am-10am (after DST = 13:00 UTC)
      { dayOfWeek: DayOfWeek.MONDAY, startTime: "09:00", endTime: "10:00" },
    ];

    const slots = generateUpcomingSlots({
      ranges,
      from,
      days: 7,
      stepMinutes: 60,
      hostTimezone: "America/New_York",
    });

    // Find the Sat slot (Mar 7, EST) and the Mon slot (Mar 9, EDT).
    const startsByDate = slots.map((s) => s.start);
    expect(startsByDate).toContain("2026-03-07T14:00:00.000Z");
    expect(startsByDate).toContain("2026-03-09T13:00:00.000Z");
  });

  it("UTC host treats wall clock as UTC directly", () => {
    const from = new Date("2026-04-26T00:00:00Z");
    const ranges = [
      { dayOfWeek: DayOfWeek.MONDAY, startTime: "09:00", endTime: "10:00" },
    ];
    const slots = generateUpcomingSlots({
      ranges,
      from,
      days: 7,
      stepMinutes: 60,
      hostTimezone: "UTC",
    });
    // Mon Apr 27 — 09:00 UTC.
    expect(slots[0].start).toBe("2026-04-27T09:00:00.000Z");
  });

  it("Tokyo host produces correct UTC offset", () => {
    const from = new Date("2026-04-26T00:00:00Z");
    const ranges = [
      // JST is UTC+9 — 09:00 wall clock = 00:00 UTC. The Monday in
      // Tokyo (Apr 27 local) starts at Sunday 15:00 UTC.
      { dayOfWeek: DayOfWeek.MONDAY, startTime: "09:00", endTime: "10:00" },
    ];
    const slots = generateUpcomingSlots({
      ranges,
      from,
      days: 7,
      stepMinutes: 60,
      hostTimezone: "Asia/Tokyo",
    });
    expect(slots[0].start).toBe("2026-04-27T00:00:00.000Z");
  });
});

describe("users.setTimezone — procedure contract", () => {
  let host: { id: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("persists a valid IANA zone", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.users.setTimezone({ timezone: "Europe/Madrid" });

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: host.id },
      select: { timezone: true },
    });
    expect(row.timezone).toBe("Europe/Madrid");
  });

  it("rejects a malformed zone via zod", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setTimezone({ timezone: "Not/A/Zone" }),
    ).rejects.toThrow();
  });

  it("rejects fixed-offset zones", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setTimezone({ timezone: "Etc/GMT-3" }),
    ).rejects.toThrow();
  });

  it("normalizes Kiev → Kyiv on persist", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const result = await caller.users.setTimezone({
      timezone: "Europe/Kiev",
    });
    expect(result.timezone).toBe("Europe/Kyiv");
  });

  it("requires authentication", async () => {
    const caller = callRouter(fakeContext());
    await expect(
      caller.users.setTimezone({ timezone: "UTC" }),
    ).rejects.toThrow(TRPCError);
  });
});

describe("bookings.create — visitor timezone capture", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-flow`);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("persists Booking.visitorTimezone when supplied", async () => {
    const caller = callRouter(fakeContext({}));
    const result = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
      visitorTimezone: "America/Los_Angeles",
    });

    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: result.id },
      select: { visitorTimezone: true },
    });
    expect(row.visitorTimezone).toBe("America/Los_Angeles");
  });

  it("leaves visitorTimezone null when omitted", async () => {
    const caller = callRouter(fakeContext({}));
    const result = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: result.id },
      select: { visitorTimezone: true },
    });
    expect(row.visitorTimezone).toBeNull();
  });

  it("rejects an invalid visitor timezone", async () => {
    const caller = callRouter(fakeContext({}));
    await expect(
      caller.bookings.create({
        handle: host.handle,
        slotStart: tomorrowAtMinute(30).toISOString(),
        visitorName: "Maya",
        visitorEmail: "maya@example.com",
        idempotencyKey: crypto.randomUUID(),
        visitorTimezone: "Mars/Olympus_Mons",
      }),
    ).rejects.toThrow();
  });
});
