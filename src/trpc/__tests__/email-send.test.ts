import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { render } from "@react-email/render";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  scheduleEmailSend,
  TASK_TYPE_EMAIL_SEND,
  type EmailSendPayload,
} from "@/lib/tasks";
import {
  TEMPLATES,
  getSubject,
  renderTemplateElement,
} from "@/lib/email/templates";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// Tests for A1 — email layer wired through the Task queue.
// 1. Templates render to non-empty HTML + text.
// 2. scheduleEmailSend writes a Task row with the expected shape.
// 3. bookings.create + bookings.cancel both enqueue the right emails.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-emails";

describe("email layer — templates render", () => {
  it("booking-created produces HTML + plain-text", async () => {
    const props = {
      hostName: "Alex Chen",
      visitorName: "Maya Lin",
      slotStartIso: new Date("2026-05-01T14:30:00Z").toISOString(),
      question: "Help with Redux state",
      confirmationUrl: "https://example.com/h/alex/booked/abc",
    };
    const subject = getSubject("booking-created", props);
    expect(subject).toBe("Booked with Alex Chen");

    const element = renderTemplateElement("booking-created", props);
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    expect(html).toContain("Alex Chen");
    expect(html).toContain("Maya Lin");
    expect(html).toContain("Help with Redux state");
    expect(text).toContain("Alex Chen");
    expect(text).toContain("Maya Lin");
  });

  it("booking-cancelled produces text without the question field", async () => {
    const props = {
      hostName: "Alex Chen",
      visitorName: "Maya Lin",
      slotStartIso: new Date("2026-05-01T14:30:00Z").toISOString(),
    };
    const subject = getSubject("booking-cancelled", props);
    expect(subject).toBe("Booking with Alex Chen cancelled");

    const element = renderTemplateElement("booking-cancelled", props);
    const text = await render(element, { plainText: true });
    expect(text).toContain("cancelled");
    expect(text).toContain("Maya Lin");
  });

  it("booking-cancelled-host surfaces the visitor's email", async () => {
    const props = {
      hostName: "Alex Chen",
      visitorName: "Maya Lin",
      visitorEmail: "maya@example.com",
      slotStartIso: new Date("2026-05-01T14:30:00Z").toISOString(),
    };
    const subject = getSubject("booking-cancelled-host", props);
    expect(subject).toBe("Maya Lin cancelled their booking");

    const element = renderTemplateElement("booking-cancelled-host", props);
    const html = await render(element);
    expect(html).toContain("maya@example.com");
  });

  it("template registry covers every wired template", () => {
    const keys = Object.keys(TEMPLATES).sort();
    expect(keys).toEqual([
      "account-deleted",
      "booking-cancelled",
      "booking-cancelled-host",
      "booking-created",
      "booking-reminder",
      "booking-rescheduled",
    ]);
  });
});

describe("scheduleEmailSend — task scheduling + dedup", () => {
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

  it("writes a Task row of type emailSend with the template payload", async () => {
    const ok = await scheduleEmailSend({
      payload: {
        to: "visitor@example.com",
        template: "booking-created",
        props: {
          hostName: "Alex",
          visitorName: "Maya",
          slotStartIso: tomorrowAtMinute(0).toISOString(),
          question: null,
          confirmationUrl: "https://example.com/booked/x",
        },
      },
      referenceUid: "test-uid-1:email:booking-created:visitor",
    });
    expect(ok).toBe(true);

    const rows = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: {
        type: true,
        payload: true,
        referenceUid: true,
        succeededAt: true,
        attempts: true,
      },
    });
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0].payload) as EmailSendPayload;
    expect(parsed.template).toBe("booking-created");
    expect(parsed.to).toBe("visitor@example.com");
    expect(rows[0].succeededAt).toBeNull();
    expect(rows[0].attempts).toBe(0);
  });

  it("dedups on (referenceUid, type) — second enqueue returns false", async () => {
    const args = {
      payload: {
        to: "visitor@example.com",
        template: "booking-created" as const,
        props: {
          hostName: "Alex",
          visitorName: "Maya",
          slotStartIso: tomorrowAtMinute(0).toISOString(),
          question: null,
          confirmationUrl: "https://example.com/booked/x",
        },
      },
      referenceUid: "dedup-test:email:booking-created:visitor",
    };
    const first = await scheduleEmailSend(args);
    const second = await scheduleEmailSend(args);
    expect(first).toBe(true);
    expect(second).toBe(false);

    const count = await prisma.task.count({
      where: { type: TASK_TYPE_EMAIL_SEND },
    });
    expect(count).toBe(1);
  });
});

describe("bookings procedures — email enqueue side effects", () => {
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

  it("bookings.create enqueues a booking-created email to the visitor", async () => {
    const caller = callRouter(fakeContext({}));
    await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya Lin",
      visitorEmail: "maya@example.com",
      question: "Test",
      idempotencyKey: crypto.randomUUID(),
    });

    const tasks = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: { payload: true, referenceUid: true },
    });
    expect(tasks).toHaveLength(1);
    const payload = JSON.parse(tasks[0].payload) as EmailSendPayload;
    expect(payload.template).toBe("booking-created");
    expect(payload.to).toBe("maya@example.com");
    expect(tasks[0].referenceUid).toMatch(
      /:email:booking-created:visitor$/,
    );
  });

  it("bookings.cancel enqueues two emails (visitor + host)", async () => {
    const caller = callRouter(fakeContext({}));
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Maya Lin",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    // Wipe the create-side email tasks so we count cancel-side cleanly.
    await prisma.task.deleteMany({});

    const authedCaller = callRouter(fakeContext({ userId: host.id }));
    await authedCaller.bookings.cancel({ publicUid: created.publicUid });

    const tasks = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: { payload: true, referenceUid: true },
    });
    expect(tasks).toHaveLength(2);

    const templates = tasks
      .map((t) => (JSON.parse(t.payload) as EmailSendPayload).template)
      .sort();
    expect(templates).toEqual(["booking-cancelled", "booking-cancelled-host"]);
  });
});
