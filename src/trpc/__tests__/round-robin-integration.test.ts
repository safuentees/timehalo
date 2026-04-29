import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";

vi.mock("@/env", async () => {
  const orig = await vi.importActual<typeof import("@/env")>("@/env");
  return {
    ...orig,
    env: {
      ...orig.env,
      GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
    },
  };
});
import {
  createTestEventTypeHostPool,
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE_RR = "vitest-rr";

describe("B2 — round-robin in bookings.create", () => {
  let host: { id: string; handle: string };
  let secondHost: { id: string };
  let eventTypeId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE_RR);
    const u = await prisma.user.create({
      data: {
        email: `vitest-rr-second-${Date.now()}@test.local`,
        availabilityRanges: {
          create: [
            { dayOfWeek: "MONDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "TUESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "WEDNESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "THURSDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "FRIDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SATURDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SUNDAY", startTime: "00:00", endTime: "23:45" },
          ],
        },
      },
      select: { id: true },
    });
    secondHost = u;
    const result = await createTestEventTypeHostPool({
      hostHandle: host.handle,
      members: [{ userId: host.id }, { userId: secondHost.id }],
    });
    eventTypeId = result.eventTypeId;
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId },
      data: { recentAssignments: 0 },
    });
  });

  afterAll(async () => {
    await prisma.eventTypeHost.deleteMany({ where: { eventTypeId } });
    await prisma.eventType.deleteMany({ where: { id: eventTypeId } });
    await prisma.user.deleteMany({ where: { id: secondHost.id } });
    await tearDownTestHost(host.id);
  });

  it("multi-host EventType: first booking stamps eventTypeId + picks deterministically", async () => {
    const caller = callRouter(fakeContext());
    const slot = tomorrowAtMinute(0);
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: slot.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const row = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: created.publicUid },
      select: { hostId: true, eventTypeId: true },
    });
    expect(row.eventTypeId).toBe(eventTypeId);
    expect([host.id, secondHost.id]).toContain(row.hostId);
    const expected = [host.id, secondHost.id].sort()[0];
    expect(row.hostId).toBe(expected);

    const winnerRow = await prisma.eventTypeHost.findFirstOrThrow({
      where: { eventTypeId, userId: row.hostId },
      select: { recentAssignments: true },
    });
    const loserId = row.hostId === host.id ? secondHost.id : host.id;
    const loserRow = await prisma.eventTypeHost.findFirstOrThrow({
      where: { eventTypeId, userId: loserId },
      select: { recentAssignments: true },
    });
    expect(winnerRow.recentAssignments).toBe(1);
    expect(loserRow.recentAssignments).toBe(0);
  });

  it("second booking flips to the OTHER host once recentAssignments bumps", async () => {
    const caller = callRouter(fakeContext());

    const first = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const firstRow = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: first.publicUid },
      select: { hostId: true },
    });

    const second = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Lin",
      visitorEmail: "lin@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const secondRow = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: second.publicUid },
      select: { hostId: true },
    });
    expect(secondRow.hostId).not.toBe(firstRow.hostId);
  });

  it("higher-priority host always wins regardless of weight", async () => {
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: secondHost.id },
      data: { priority: 5, weight: 99 }, // huge weight, doesn't matter
    });
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: host.id },
      data: { priority: 1, weight: 1, recentAssignments: 0 },
    });

    const caller = callRouter(fakeContext());
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const row = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: created.publicUid },
      select: { hostId: true },
    });
    expect(row.hostId).toBe(secondHost.id);

    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: secondHost.id },
      data: { priority: 2, weight: 1 },
    });
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: host.id },
      data: { priority: 2, weight: 1 },
    });
  });

  describe("calendar conflict → excludeHostIds (B.PT12)", () => {
    let credentialId: string;
    let busyHostId: string;
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      busyHostId = [host.id, secondHost.id].sort()[0];

      const cred = await prisma.calendarCredential.create({
        data: {
          userId: busyHostId,
          provider: "GOOGLE",
          externalAccountId: "rr-cal-account",
          externalAccountEmail: "rr-host@example.com",
          accessToken: "plain-access-token",
          refreshToken: "plain-refresh-token",
          accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        },
        select: { id: true },
      });
      credentialId = cred.id;
      await prisma.selectedCalendar.create({
        data: {
          credentialId: cred.id,
          externalCalendarId: "primary",
          summary: "Personal",
          isPrimary: true,
        },
      });
    });

    beforeEach(async () => {
      originalFetch = globalThis.fetch;
      await prisma.booking.deleteMany({ where: { eventTypeId } });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
    });

    afterAll(async () => {
      await prisma.selectedCalendar.deleteMany({
        where: { credentialId },
      });
      await prisma.calendarCredential.deleteMany({
        where: { id: credentialId },
      });
    });

    it("excludes a host whose external calendar is busy at the slot", async () => {
      const slotStart = tomorrowAtMinute(0);
      const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);

      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input.toString();
        if (url.includes("calendar/v3/freeBusy")) {
          return new Response(
            JSON.stringify({
              calendars: {
                primary: {
                  busy: [
                    {
                      start: slotStart.toISOString(),
                      end: slotEnd.toISOString(),
                    },
                  ],
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });
      globalThis.fetch =
        fetchSpy as unknown as typeof globalThis.fetch;

      const caller = callRouter(fakeContext());
      const created = await caller.bookings.create({
        handle: host.handle,
        slotStart: slotStart.toISOString(),
        visitorName: "Maya",
        visitorEmail: "maya@example.com",
        idempotencyKey: crypto.randomUUID(),
      });

      const row = await prisma.booking.findUniqueOrThrow({
        where: { publicUid: created.publicUid },
        select: { hostId: true },
      });
      const otherHostId =
        busyHostId === host.id ? secondHost.id : host.id;
      expect(row.hostId).toBe(otherHostId);

      expect(fetchSpy).toHaveBeenCalled();
    });

    it("returns CONFLICT when every pool member is calendar-busy", async () => {
      const otherHostId =
        busyHostId === host.id ? secondHost.id : host.id;
      const otherCred = await prisma.calendarCredential.create({
        data: {
          userId: otherHostId,
          provider: "GOOGLE",
          externalAccountId: "rr-cal-account-other",
          externalAccountEmail: "rr-other@example.com",
          accessToken: "plain-access-token",
          refreshToken: "plain-refresh-token",
          accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        },
        select: { id: true },
      });
      await prisma.selectedCalendar.create({
        data: {
          credentialId: otherCred.id,
          externalCalendarId: "primary",
          summary: "Personal",
          isPrimary: true,
        },
      });

      try {
        const slotStart = tomorrowAtMinute(30);
        const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);

        const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
          const url =
            typeof input === "string" ? input : input.toString();
          if (url.includes("calendar/v3/freeBusy")) {
            return new Response(
              JSON.stringify({
                calendars: {
                  primary: {
                    busy: [
                      {
                        start: slotStart.toISOString(),
                        end: slotEnd.toISOString(),
                      },
                    ],
                  },
                },
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw new Error(`Unexpected fetch call: ${url}`);
        });
        globalThis.fetch =
          fetchSpy as unknown as typeof globalThis.fetch;

        const caller = callRouter(fakeContext());
        await expect(
          caller.bookings.create({
            handle: host.handle,
            slotStart: slotStart.toISOString(),
            visitorName: "Maya",
            visitorEmail: "maya@example.com",
            idempotencyKey: crypto.randomUUID(),
          }),
        ).rejects.toThrow(/already booked at that slot/);
      } finally {
        await prisma.selectedCalendar.deleteMany({
          where: { credentialId: otherCred.id },
        });
        await prisma.calendarCredential.deleteMany({
          where: { id: otherCred.id },
        });
      }
    });
  });
});
