import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

// A4 — Mocked-adapter calendar integration test. Closes ef65c97's
// WHAT'S DEFERRED:
//
//   "Mocked-adapter integration test of full subtract → slot
//   suppression flow. Tests here cover the pure merge semantics in
//   isolation; an integration test with a fetch mock would exercise
//   the full chain."
//
// Chain under test:
//   schedule.getUpcomingSlots
//     → fetchHostBusyTimes (src/lib/calendar/index.ts)
//     → googleAdapter.getBusyTimes (src/lib/calendar/google.ts)
//       → fetch(GOOGLE_FREEBUSY) ← mocked here
//     → subtractBusyTimes
//   ─ asserts a slot overlapping the mocked busy range is dropped.
//
// vi.mock for @/env is hoisted above all imports so the env values
// the Google adapter reads (GOOGLE_OAUTH_CLIENT_ID / _SECRET) are
// always set, regardless of the operator's local .env. Other env
// fields fall through to the real parsed schema via importActual so
// DATABASE_URL, AUTH_SECRET etc. behave normally.

vi.mock("@/env", async () => {
  const orig =
    await vi.importActual<typeof import("@/env")>("@/env");
  return {
    ...orig,
    env: {
      ...orig.env,
      GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
    },
  };
});

const callRouter = createCaller(appRouter);

describe("calendar busy-time integration (mocked Google freeBusy)", () => {
  let host: { id: string; handle: string };
  let credentialId: string;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    // Pin to a known Thursday morning UTC so `getUpcomingSlots`
    // deterministically finds upcoming slots regardless of the
    // operator's wall clock. See calendar.test.ts for context: the
    // test host's weekday availability runs out after ~23:45 UTC
    // and `days:1` calls below return [] without the pin.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T14:00:00Z"));
    host = await createTestHost("vitest-cal-integration");
    // Plaintext tokens — encryption helper's `decryptToken` returns
    // input unchanged when there's no `v1:` envelope prefix (see
    // src/lib/calendar/encryption.ts:77-83), so the test doesn't
    // need CALENDAR_TOKEN_KEY set. accessTokenExpiresAt is far in
    // the future to short-circuit refreshGoogleToken — the only
    // upstream call is the freeBusy POST.
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "integration-account",
        externalAccountEmail: "host@example.com",
        accessToken: "plain-access-token",
        refreshToken: "plain-refresh-token",
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scope: "https://www.googleapis.com/auth/calendar.readonly",
      },
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

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(async () => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    await prisma.selectedCalendar.deleteMany({ where: { credentialId } });
    await prisma.calendarCredential.deleteMany({
      where: { id: credentialId },
    });
    await tearDownTestHost(host.id);
  });

  it("drops slots that overlap the busy range returned by Google freeBusy", async () => {
    // Pick a target slot far enough in the future that
    // generateUpcomingSlots will emit it. Tomorrow 14:00–14:15 UTC
    // is reliably reachable: createTestHost seeds 00:00–23:45
    // every weekday, so the 14:00 step is always present.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(14, 0, 0, 0);
    const busyStart = new Date(tomorrow);
    const busyEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);
    const targetSlotStart = busyStart.toISOString();
    const adjacentSlotStart = new Date(
      busyEnd.getTime(),
    ).toISOString();

    // Mock global fetch — only the freeBusy URL is served. Anything
    // else throws so an unmocked dependency surfaces immediately
    // instead of silently hitting the real network.
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("calendar/v3/freeBusy")) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: busyStart.toISOString(),
                    end: busyEnd.toISOString(),
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const caller = callRouter(fakeContext({ userId: host.id }));
    const slots = await caller.schedule.getUpcomingSlots({
      handle: host.handle,
      days: 2,
    });

    // Assert: the freeBusy endpoint was hit exactly once (refresh
    // skipped because accessTokenExpiresAt is fresh).
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Assert: the slot starting at the busy range's start is gone.
    expect(slots.some((s) => s.start === targetSlotStart)).toBe(false);
    // Assert: the slot starting at the busy range's end IS present
    // (boundary-touching slot survives, per subtractBusyTimes
    // semantics tested in calendar.test.ts).
    expect(slots.some((s) => s.start === adjacentSlotStart)).toBe(true);
  });

  it("returns the full slot set when freeBusy returns no busy ranges", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("calendar/v3/freeBusy")) {
        return new Response(
          JSON.stringify({ calendars: { primary: { busy: [] } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const caller = callRouter(fakeContext({ userId: host.id }));
    const slots = await caller.schedule.getUpcomingSlots({
      handle: host.handle,
      days: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // No busy → at least one slot survives. Exact count varies with
    // the current wall-clock time (slots in the past today are
    // pruned), so assert nonzero rather than a fixed count.
    expect(slots.length).toBeGreaterThan(0);
  });

  it("falls through to the unfiltered slot list when freeBusy 500s", async () => {
    // fetchHostBusyTimes wraps each adapter call in
    // Promise.allSettled; a thrown adapter error is logged and
    // dropped, returning [] busy. The slot list comes through
    // intact — one provider's bad day doesn't black out the public
    // host page.
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("calendar/v3/freeBusy")) {
        return new Response("upstream error", { status: 500 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const caller = callRouter(fakeContext({ userId: host.id }));
    const slots = await caller.schedule.getUpcomingSlots({
      handle: host.handle,
      days: 1,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(slots.length).toBeGreaterThan(0);
  });
});
