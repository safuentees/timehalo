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
import { POST as cronHandler } from "@/app/api/cron/process-tasks/route";
import { signWebhookBody } from "@/lib/webhook-signature";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// Tests for §10.1 item 6 — the cron processor at
// /api/cron/process-tasks. We invoke the route handler directly
// (not via HTTP) and stub `globalThis.fetch` so the receiver
// roundtrip is observable + deterministic. CRON_SECRET is set in the
// test process so authorization checks pass.
//
// Pattern verified via Context7: vi.stubGlobal('fetch', ...) +
// vi.unstubAllGlobals() in afterEach is the canonical Vitest 4 way
// to mock global fetch.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-cron";
const CRON_SECRET = "vitest-cron-secret";

function authedRequest() {
  return new Request("http://localhost:3001/api/cron/process-tasks", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}
function unauthedRequest() {
  return new Request("http://localhost:3001/api/cron/process-tasks", {
    method: "POST",
  });
}

describe("cron — webhook delivery processor", () => {
  let host: { id: string };
  let webhookId: number;
  let webhookSecret: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
    // Create a fresh webhook for every test so we have a clean
    // active=true / failure-count=0 starting state.
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    const created = await hostCaller.webhooks.create({
      slug: HANDLE,
      subscriberUrl: "https://receiver.test/hook",
      events: ["booking.created"],
    });
    webhookSecret = created.secret;
    const sub = await prisma.webhookSubscription.findUniqueOrThrow({
      where: { publicUid: created.publicUid },
    });
    webhookId = sub.id;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await tearDownTestHost(host.id);
  });

  async function makeBookingThatSchedulesATask() {
    const visitorCaller = callRouter(fakeContext());
    const booking = await visitorCaller.bookings.create({
      handle: HANDLE,
      slotStart: tomorrowAtMinute(0).toISOString(),
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Visitor",
      visitorEmail: "v@test.local",
    });
    // bookings.create also enqueues a booking-created email task and
    // a calendarWrite task (B2). Both would be picked up + perma-
    // failed by the cron (no RESEND_API_KEY, no calendar credential
    // in test env), polluting succeeded/failed counters. Strip them
    // so this suite stays focused on webhook delivery.
    await prisma.task.deleteMany({
      where: { type: { in: ["emailSend", "calendarWrite"] } },
    });
    return booking;
  }

  it("rejects requests with no Authorization header (401)", async () => {
    const res = await cronHandler(unauthedRequest());
    expect(res.status).toBe(401);
  });

  it("rejects requests with the wrong bearer token (401)", async () => {
    const res = await cronHandler(
      new Request("http://localhost:3001/api/cron/process-tasks", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("on 2xx response: marks succeededAt + signs the body correctly", async () => {
    await makeBookingThatSchedulesATask();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await cronHandler(authedRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.succeeded).toBe(1);
    expect(json.failed).toBe(0);

    // Verify the receiver was called with the expected URL + headers.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://receiver.test/hook");
    expect(calledOpts.method).toBe("POST");
    expect(calledOpts.headers["X-Officehours-Event"]).toBe("booking.created");
    expect(calledOpts.headers["Content-Type"]).toBe("application/json");

    // Verify the signature matches HMAC-SHA-256 of the exact body.
    const expectedSig = await signWebhookBody(webhookSecret, calledOpts.body);
    expect(calledOpts.headers["X-Officehours-Signature"]).toBe(expectedSig);

    // Task row marked done.
    const task = await prisma.task.findFirstOrThrow();
    expect(task.succeededAt).not.toBeNull();
    expect(task.attempts).toBe(1);
    expect(task.lastError).toBeNull();
  });

  it("on 500 response: increments attempts + reschedules with backoff", async () => {
    await makeBookingThatSchedulesATask();
    const taskBefore = await prisma.task.findFirstOrThrow();
    const originalScheduledAt = taskBefore.scheduledAt;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 500 })),
    );

    const res = await cronHandler(authedRequest());
    const json = await res.json();
    expect(json.succeeded).toBe(0);
    expect(json.failed).toBe(1);

    const taskAfter = await prisma.task.findFirstOrThrow();
    expect(taskAfter.attempts).toBe(1);
    expect(taskAfter.succeededAt).toBeNull();
    expect(taskAfter.lastError).toContain("500");
    // Backoff pushed scheduledAt forward (5min × 2^1 = 10min from now).
    expect(taskAfter.scheduledAt.getTime()).toBeGreaterThan(
      originalScheduledAt.getTime(),
    );
  });

  it("on 410 GONE: auto-deactivates the subscription + permanently fails the task", async () => {
    await makeBookingThatSchedulesATask();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("gone", { status: 410 })),
    );

    await cronHandler(authedRequest());

    const sub = await prisma.webhookSubscription.findUniqueOrThrow({
      where: { id: webhookId },
    });
    expect(sub.active).toBe(false);

    const task = await prisma.task.findFirstOrThrow();
    expect(task.succeededAt).toBeNull();
    // markPermanentlyFailed bumps attempts past maxAttempts so the
    // row is excluded from future runs.
    expect(task.attempts).toBeGreaterThanOrEqual(task.maxAttempts);
    expect(task.lastError).toContain("410");
  });

  it("stops retrying after maxAttempts is reached", async () => {
    await makeBookingThatSchedulesATask();
    const task = await prisma.task.findFirstOrThrow();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("err", { status: 500 })),
    );

    // Manually fast-forward to "attempts equals maxAttempts" + reset
    // scheduledAt so the cron picks it up.
    await prisma.task.update({
      where: { id: task.id },
      data: { attempts: task.maxAttempts, scheduledAt: new Date() },
    });

    await cronHandler(authedRequest());

    // The cron's in-process check (`task.attempts >= task.maxAttempts`)
    // skips this row entirely. Fetch is never called.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
