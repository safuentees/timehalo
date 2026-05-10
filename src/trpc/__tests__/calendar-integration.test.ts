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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T14:00:00Z"));
    host = await createTestHost("vitest-cal-integration");
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
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(14, 0, 0, 0);
    const busyStart = new Date(tomorrow);
    const busyEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);
    const targetSlotStart = busyStart.toISOString();
    const adjacentSlotStart = new Date(
      busyEnd.getTime(),
    ).toISOString();

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

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(slots.some((s) => s.start === targetSlotStart)).toBe(false);
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
    expect(slots.length).toBeGreaterThan(0);
  });

  it("falls through to the unfiltered slot list when freeBusy 500s", async () => {
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
