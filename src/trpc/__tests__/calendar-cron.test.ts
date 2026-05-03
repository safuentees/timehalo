import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
} from "../../../test/fixtures";

// B2 — Cron-driven calendar two-way write. We invoke the cron route
// directly (not via HTTP) and stub fetch to intercept the Google
// freeBusy + events endpoints. Mirrors the calendar-integration
// test's vi.mock pattern so the env vars are always set.

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
const HANDLE = "vitest-cal-cron";
const CRON_SECRET = "vitest-cal-cron-secret";

function authedRequest() {
  return new Request("http://localhost:3001/api/cron/process-tasks", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("cron — calendar write processor (B2)", () => {
  let host: { id: string; handle: string };
  let credentialId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);

    // Plaintext access token + future expiry so refreshGoogleToken
    // short-circuits — only the events.insert / .patch / .delete
    // call hits fetch in each test.
    const cred = await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "calendar-cron-account",
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

  beforeEach(async () => {
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId: host.id } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.selectedCalendar.deleteMany({ where: { credentialId } });
    await prisma.calendarCredential.deleteMany({
      where: { id: credentialId },
    });
    await tearDownTestHost(host.id);
  });

  it("create: POSTs events.insert and stamps the booking with externalCalendarEventId", async () => {
    // 1) Create the booking — this enqueues a calendarWrite task.
    const visitorCaller = callRouter(fakeContext());
    const booking = await visitorCaller.bookings.create({
      handle: HANDLE,
      slotStart: tomorrowAtMinute(0).toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Maya",
      visitorEmail: "maya@test.local",
    });

    // 2) Strip non-calendarWrite tasks (email reminder, webhooks)
    //    so the cron only picks the row we care about.
    await prisma.task.deleteMany({
      where: { type: { in: ["emailSend", "webhookDelivery"] } },
    });

    // 3) Stub fetch to return a Google events.insert response.
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/calendars/primary/events")) {
        return new Response(JSON.stringify({ id: "google-event-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST: cronHandler } = await import(
      "@/app/api/cron/process-tasks/route"
    );
    const res = await cronHandler(authedRequest());
    const json = await res.json();
    expect(json.succeeded).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 4) Booking row was updated with the external event id +
    //    credential id.
    const refreshed = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: booking.publicUid },
      select: {
        externalCalendarEventId: true,
        externalCalendarCredentialId: true,
      },
    });
    expect(refreshed.externalCalendarEventId).toBe("google-event-123");
    expect(refreshed.externalCalendarCredentialId).toBe(credentialId);
  });

  it("delete: DELETEs the recorded event and clears the booking pointer", async () => {
    // Seed a booking with an existing external event so cancel has
    // something to delete.
    const visitorCaller = callRouter(fakeContext());
    const booking = await visitorCaller.bookings.create({
      handle: HANDLE,
      slotStart: tomorrowAtMinute(15).toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Bea",
      visitorEmail: "bea@test.local",
    });
    await prisma.booking.update({
      where: { publicUid: booking.publicUid },
      data: {
        externalCalendarEventId: "google-event-to-delete",
        externalCalendarCredentialId: credentialId,
      },
    });
    // Strip create tasks so we control what the cron picks.
    await prisma.task.deleteMany({});

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: booking.publicUid });
    // Strip the cancel-side email tasks — focus on calendarWrite.
    await prisma.task.deleteMany({
      where: { type: { in: ["emailSend", "webhookDelivery"] } },
    });

    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/calendars/primary/events/google-event-to-delete") &&
        init?.method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST: cronHandler } = await import(
      "@/app/api/cron/process-tasks/route"
    );
    const res = await cronHandler(authedRequest());
    const json = await res.json();
    expect(json.succeeded).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Pointer cleared so re-running the cancel is a no-op.
    const refreshed = await prisma.booking.findUniqueOrThrow({
      where: { publicUid: booking.publicUid },
      select: { externalCalendarEventId: true },
    });
    expect(refreshed.externalCalendarEventId).toBeNull();
  });

  it("create: permanently fails when host has no connected calendar", async () => {
    // Create a booking with NO calendar credential on the host.
    // Use a separate host that has no calendar set up.
    const noCalHost = await createTestHost("vitest-cal-cron-nocal");
    try {
      const visitorCaller = callRouter(fakeContext());
      await visitorCaller.bookings.create({
        handle: noCalHost.handle,
        slotStart: tomorrowAtMinute(0).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Noc",
        visitorEmail: "noc@test.local",
      });
      await prisma.task.deleteMany({
        where: { type: { in: ["emailSend", "webhookDelivery"] } },
      });

      const fetchSpy = vi.fn(async () => {
        throw new Error("fetch should NOT be called when host has no calendar");
      });
      vi.stubGlobal("fetch", fetchSpy);

      const { POST: cronHandler } = await import(
        "@/app/api/cron/process-tasks/route"
      );
      const res = await cronHandler(authedRequest());
      const json = await res.json();
      // calendarWrite task perma-fails (attempts hops to maxAttempts);
      // failed counter ticks. fetch never called.
      expect(json.failed).toBeGreaterThanOrEqual(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      const tasks = await prisma.task.findMany({
        where: { type: "calendarWrite" },
      });
      expect(tasks[0].lastError).toContain("no connected calendar");
    } finally {
      await tearDownTestHost(noCalHost.id);
    }
  });
});
