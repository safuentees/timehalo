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

// Hoisted env mock so the Google adapter sees configured OAuth client
// regardless of the operator's local .env. Pattern mirrors
// calendar-integration.test.ts. Other env keys fall through via
// importActual so DATABASE_URL etc. behave normally.
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

// B2 — round-robin host selection wired through bookings.create.
//
// createTestHost seeds a User + Workspace + Membership but doesn't
// seed an EventType (test fixture is older than the B2 schema). For
// the singleton-fixed case we let the booking fall through to
// pickedHostId = host.id (current behavior, eventTypeId stays null).
//
// For multi-host coverage we use createTestEventTypeHostPool to mint
// an EventType + EventTypeHost rows on the SAME workspace. Both
// hosts share the same handle's bookable surface; the round-robin
// algorithm picks based on priority + weight + recentAssignments.
// The contract here:
// (a) two hosts, equal weight, zero recent → first booking lands on
//     either deterministically (id-sort tiebreak); second booking
//     after the first's recentAssignments bumped → other host gets
//     it.
// (b) higher-priority host always wins regardless of weight.

const callRouter = createCaller(appRouter);
const HANDLE_RR = "vitest-rr";

describe("B2 — round-robin in bookings.create", () => {
  let host: { id: string; handle: string };
  let secondHost: { id: string };
  let eventTypeId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE_RR);
    // Second host: any User with availability ranges so the round-
    // robin pick can land. We only need the user row; this user
    // doesn't need their own handle for the test path because the
    // booking targets the FIRST host's handle and the algorithm
    // picks across the EventType's host pool.
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
    // Reset recentAssignments so each test starts from zero.
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
    // Tiebreak is id-sort (lowercase alpha). Both hosts have score 0
    // / 1 = 0; the lower id wins. Assert that the picked host is one
    // of the two and matches the expected tiebreak.
    expect([host.id, secondHost.id]).toContain(row.hostId);
    const expected = [host.id, secondHost.id].sort()[0];
    expect(row.hostId).toBe(expected);

    // recentAssignments was bumped on the picked host.
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

    // First booking — same id-sort tiebreak as the prior test.
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

    // Second booking, different slot. Round-robin should now favor
    // the OTHER host (winner had recentAssignments bumped to 1, loser
    // still at 0; loser's score is 0 vs 1/1 = 1, lower wins).
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
    // Bump the second host's priority so they outrank the original.
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

    // Reset for the rest of the suite — the afterAll teardown
    // doesn't care about field values, but other tests in this file
    // assume both hosts at priority 2.
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: secondHost.id },
      data: { priority: 2, weight: 1 },
    });
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId, userId: host.id },
      data: { priority: 2, weight: 1 },
    });
  });

  // ── B.PT12 — calendar conflict feeds excludeHostIds ──────────────
  // The calendar-busy host is excluded from the round-robin pick so
  // a multi-host pool with at least one free member doesn't throw
  // CONFLICT. We connect a Google calendar to whichever host would
  // win the id-sort tiebreak, then mock freeBusy to return a busy
  // range overlapping the requested slot — the OTHER host should
  // get picked.
  describe("calendar conflict → excludeHostIds (B.PT12)", () => {
    let credentialId: string;
    let busyHostId: string;
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      // Pick the host that would normally win the id-sort tiebreak.
      // We connect THEIR calendar and mark them busy — round-robin
      // should then pick the other host instead. If we connected
      // the loser's calendar the test would prove nothing because
      // the loser already wasn't getting picked.
      busyHostId = [host.id, secondHost.id].sort()[0];

      const cred = await prisma.calendarCredential.create({
        data: {
          userId: busyHostId,
          provider: "GOOGLE",
          externalAccountId: "rr-cal-account",
          externalAccountEmail: "rr-host@example.com",
          // Plaintext tokens — encryption helper returns input
          // unchanged when there's no `v1:` envelope prefix, so the
          // test doesn't need CALENDAR_TOKEN_KEY set. expiresAt far
          // in the future short-circuits refreshGoogleToken.
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
      // Outer beforeEach only wipes bookings where hostId === host.id,
      // so prior tests' bookings on secondHost.id leak in. Wipe by
      // eventTypeId here to reset the pool's slot state regardless of
      // which host won the prior pick. Bookings for fixtures outside
      // this event type stay untouched.
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

      // Mock freeBusy to return a busy range overlapping the slot.
      // Anything else throws so an unmocked dependency surfaces.
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
      // The OTHER host (not the one whose calendar is busy) wins.
      const otherHostId =
        busyHostId === host.id ? secondHost.id : host.id;
      expect(row.hostId).toBe(otherHostId);

      // freeBusy was hit at least once for the connected host. The
      // other host has no CalendarCredential, so no second call.
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("returns CONFLICT when every pool member is calendar-busy", async () => {
      // Connect a calendar for the OTHER host too so both pool
      // members hit the freeBusy mock.
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
