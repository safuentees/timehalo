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

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-cron";
const CRON_SECRET = "vitest-cron-secret";

function authedRequest() {
  return new Request("http://localhost:3000/api/cron/process-tasks", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}
function unauthedRequest() {
  return new Request("http://localhost:3000/api/cron/process-tasks", {
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
      new Request("http://localhost:3000/api/cron/process-tasks", {
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://receiver.test/hook");
    expect(calledOpts.method).toBe("POST");
    expect(calledOpts.headers["X-Officehours-Event"]).toBe("booking.created");
    expect(calledOpts.headers["Content-Type"]).toBe("application/json");

    const expectedSig = await signWebhookBody(webhookSecret, calledOpts.body);
    expect(calledOpts.headers["X-Officehours-Signature"]).toBe(expectedSig);

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

    await prisma.task.update({
      where: { id: task.id },
      data: { attempts: task.maxAttempts, scheduledAt: new Date() },
    });

    await cronHandler(authedRequest());

    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
