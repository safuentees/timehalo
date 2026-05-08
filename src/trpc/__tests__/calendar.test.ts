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
import { mergeBusyTimes, subtractBusyTimes } from "@/lib/calendar/busy-merge";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
} from "../../../test/fixtures";

describe("mergeBusyTimes", () => {
  it("returns [] for empty input", () => {
    expect(mergeBusyTimes([])).toEqual([]);
  });

  it("merges overlapping ranges into one", () => {
    const merged = mergeBusyTimes([
      { start: "2026-05-01T09:00:00Z", end: "2026-05-01T10:00:00Z" },
      { start: "2026-05-01T09:30:00Z", end: "2026-05-01T11:00:00Z" },
    ]);
    expect(merged).toEqual([
      { start: "2026-05-01T09:00:00.000Z", end: "2026-05-01T11:00:00.000Z" },
    ]);
  });

  it("merges adjacent ranges (touching ends)", () => {
    const merged = mergeBusyTimes([
      { start: "2026-05-01T09:00:00Z", end: "2026-05-01T10:00:00Z" },
      { start: "2026-05-01T10:00:00Z", end: "2026-05-01T11:00:00Z" },
    ]);
    expect(merged.length).toBe(1);
  });

  it("preserves disjoint ranges, sorted by start", () => {
    const merged = mergeBusyTimes([
      { start: "2026-05-01T11:00:00Z", end: "2026-05-01T12:00:00Z" },
      { start: "2026-05-01T09:00:00Z", end: "2026-05-01T10:00:00Z" },
    ]);
    expect(merged.length).toBe(2);
    expect(merged[0].start).toBe("2026-05-01T09:00:00.000Z");
    expect(merged[1].start).toBe("2026-05-01T11:00:00.000Z");
  });
});

describe("subtractBusyTimes", () => {
  const slots = [
    { start: "2026-05-01T09:00:00.000Z", end: "2026-05-01T09:15:00.000Z" },
    { start: "2026-05-01T09:15:00.000Z", end: "2026-05-01T09:30:00.000Z" },
    { start: "2026-05-01T09:30:00.000Z", end: "2026-05-01T09:45:00.000Z" },
    { start: "2026-05-01T09:45:00.000Z", end: "2026-05-01T10:00:00.000Z" },
  ];

  it("returns all slots when busy is empty", () => {
    expect(subtractBusyTimes(slots, [])).toEqual(slots);
  });

  it("drops slots that overlap a busy range entirely", () => {
    const filtered = subtractBusyTimes(slots, [
      { start: "2026-05-01T09:15:00Z", end: "2026-05-01T09:30:00Z" },
    ]);
    expect(filtered).toHaveLength(3);
    expect(
      filtered.some((s) => s.start === "2026-05-01T09:15:00.000Z"),
    ).toBe(false);
  });

  it("drops slots that partially overlap (15-min slot vs 5-min meeting)", () => {
    const filtered = subtractBusyTimes(slots, [
      { start: "2026-05-01T09:20:00Z", end: "2026-05-01T09:25:00Z" },
    ]);
    expect(filtered).toHaveLength(3);
    expect(
      filtered.find((s) => s.start === "2026-05-01T09:15:00.000Z"),
    ).toBeUndefined();
  });

  it("does NOT drop slots that just touch a boundary (busy ends exactly at slot start)", () => {
    const filtered = subtractBusyTimes(slots, [
      { start: "2026-05-01T09:00:00Z", end: "2026-05-01T09:30:00Z" },
    ]);
    expect(
      filtered.some((s) => s.start === "2026-05-01T09:30:00.000Z"),
    ).toBe(true);
  });

  it("handles multiple busy ranges across the slot list", () => {
    const filtered = subtractBusyTimes(slots, [
      { start: "2026-05-01T09:00:00Z", end: "2026-05-01T09:15:00Z" },
      { start: "2026-05-01T09:45:00Z", end: "2026-05-01T10:00:00Z" },
    ]);
    expect(filtered.map((s) => s.start)).toEqual([
      "2026-05-01T09:15:00.000Z",
      "2026-05-01T09:30:00.000Z",
    ]);
  });
});

describe("calendar.connections + disconnect (procedure contracts)", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost("vitest-calendar");
  });
  beforeEach(async () => {
    await prisma.selectedCalendar.deleteMany({});
    await prisma.calendarCredential.deleteMany({});
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("connections returns [] when no providers are linked", async () => {
    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    const list = await caller.calendar.connections();
    expect(list).toEqual([]);
  });

  it("connections lists the row + selected count after a manual seed", async () => {
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "google-account-1",
        externalAccountEmail: "host@example.com",
        accessToken: "fake-access",
        refreshToken: "fake-refresh",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scope: "https://www.googleapis.com/auth/calendar.readonly",
      },
    });
    await prisma.selectedCalendar.create({
      data: {
        credentialId: cred.id,
        externalCalendarId: "primary",
        summary: "Personal",
        isPrimary: true,
      },
    });

    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    const list = await caller.calendar.connections();
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe("GOOGLE");
    expect(list[0]._count.selectedCalendars).toBe(1);
  });

  it("disconnect deletes the credential + cascades selected calendars", async () => {
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "google-account-2",
        accessToken: "fake-access",
        refreshToken: "fake-refresh",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scope: "test",
      },
    });
    await prisma.selectedCalendar.create({
      data: {
        credentialId: cred.id,
        externalCalendarId: "primary",
        summary: "Personal",
      },
    });
    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    await caller.calendar.disconnect({ credentialId: cred.id });
    expect(
      await prisma.calendarCredential.findUnique({ where: { id: cred.id } }),
    ).toBeNull();
    expect(
      await prisma.selectedCalendar.count({
        where: { credentialId: cred.id },
      }),
    ).toBe(0);
  });

  it("disconnect rejects a credential that doesn't belong to the caller", async () => {
    const otherHost = await createTestHost("vitest-calendar-other");
    try {
      const cred = await prisma.calendarCredential.create({
        data: {
          userId: otherHost.id,
          provider: "GOOGLE",
          externalAccountId: "stranger-account",
          accessToken: "x",
          refreshToken: "y",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000),
          scope: "test",
        },
      });
      const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
      await expect(
        caller.calendar.disconnect({ credentialId: cred.id }),
      ).rejects.toThrow(TRPCError);
    } finally {
      await tearDownTestHost(otherHost.id);
    }
  });

  const oauthConfigured = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.MICROSOFT_OAUTH_CLIENT_ID,
  );

  it.skipIf(oauthConfigured)("authUrl rejects when the provider isn't configured (env unset)", async () => {
    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    await expect(
      caller.calendar.authUrl({ provider: "GOOGLE" }),
    ).rejects.toThrow(/not configured|PRECONDITION_FAILED/i);
  });

  it.skipIf(oauthConfigured)("listCalendars rejects when the provider isn't configured", async () => {
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "google-account-3",
        accessToken: "x",
        refreshToken: "y",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scope: "test",
      },
    });
    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    await expect(
      caller.calendar.listCalendars({ credentialId: cred.id }),
    ).rejects.toThrow(/not configured|PRECONDITION_FAILED/i);
  });
});

describe("calendar.setSelected", () => {
  let host: { id: string };
  let credentialId: string;

  beforeAll(async () => {
    host = await createTestHost("vitest-calendar-sel");
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "select-test",
        accessToken: "x",
        refreshToken: "y",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scope: "test",
      },
    });
    credentialId = cred.id;
  });
  beforeEach(async () => {
    await prisma.selectedCalendar.deleteMany({ where: { credentialId } });
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("inserts new selections + removes ones not in the new set", async () => {
    const caller = createCaller(appRouter)(fakeContext({ userId: host.id }));
    await caller.calendar.setSelected({
      credentialId,
      calendars: [
        {
          externalCalendarId: "primary",
          summary: "Personal",
          isPrimary: true,
        },
        {
          externalCalendarId: "work@example.com",
          summary: "Work",
          isPrimary: false,
        },
      ],
    });
    let rows = await prisma.selectedCalendar.findMany({
      where: { credentialId },
      select: { externalCalendarId: true },
      orderBy: { externalCalendarId: "asc" },
    });
    expect(rows.map((r) => r.externalCalendarId)).toEqual([
      "primary",
      "work@example.com",
    ]);

    await caller.calendar.setSelected({
      credentialId,
      calendars: [
        {
          externalCalendarId: "primary",
          summary: "Personal",
          isPrimary: true,
        },
      ],
    });
    rows = await prisma.selectedCalendar.findMany({
      where: { credentialId },
      select: { externalCalendarId: true },
    });
    expect(rows.map((r) => r.externalCalendarId)).toEqual(["primary"]);
  });

  it("rejects a credential the caller doesn't own", async () => {
    const otherHost = await createTestHost("vitest-calendar-sel-other");
    try {
      const caller = createCaller(appRouter)(
        fakeContext({ userId: otherHost.id }),
      );
      await expect(
        caller.calendar.setSelected({
          credentialId,
          calendars: [
            {
              externalCalendarId: "primary",
              summary: "x",
              isPrimary: false,
            },
          ],
        }),
      ).rejects.toThrow(TRPCError);
    } finally {
      await tearDownTestHost(otherHost.id);
    }
  });
});

describe("schedule.getUpcomingSlots — busy-time integration", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T14:00:00Z"));
    host = await createTestHost("vitest-calendar-merge");
  });
  beforeEach(async () => {
    await prisma.booking.deleteMany({ where: { hostId: host.id } });
    await prisma.selectedCalendar.deleteMany({});
    await prisma.calendarCredential.deleteMany({});
  });
  afterAll(async () => {
    vi.useRealTimers();
    await tearDownTestHost(host.id);
  });

  it("returns slots unaltered when no calendar is connected", async () => {
    const caller = createCaller(appRouter)(fakeContext());
    const slots = await caller.schedule.getUpcomingSlots({
      handle: host.handle,
      days: 1,
    });
    expect(slots.length).toBeGreaterThan(0);
  });

  it("connecting a credential (no OAuth env) doesn't break slot query", async () => {
    await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "stub",
        accessToken: "x",
        refreshToken: "y",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scope: "test",
      },
    });
    const caller = createCaller(appRouter)(fakeContext());
    const slots = await caller.schedule.getUpcomingSlots({
      handle: host.handle,
      days: 1,
    });
    expect(slots.length).toBeGreaterThan(0);
  });
});

void tomorrowAtMinute;
