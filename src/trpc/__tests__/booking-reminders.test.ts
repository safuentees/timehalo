import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { render } from "@react-email/render";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { TASK_TYPE_EMAIL_SEND, type EmailSendPayload } from "@/lib/tasks";
import {
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

// A8 — booking-reminder Task scheduled 1h before slotStart, cancelled
// on cancel, swapped on reschedule.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-reminders";
const ONE_HOUR_MS = 60 * 60 * 1000;

describe("booking-reminder template render", () => {
  it("subject + body include the host name and slot line", async () => {
    const props = {
      hostName: "Alex Chen",
      visitorName: "Maya Lin",
      slotStartIso: new Date("2026-05-01T14:30:00Z").toISOString(),
      confirmationUrl: "https://example.com/h/alex/booked/abc",
      recipientEmail: "maya@example.com",
    };
    expect(getSubject("booking-reminder", props)).toBe(
      "Starting in 1 hour — Alex Chen",
    );
    const element = renderTemplateElement("booking-reminder", props);
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    expect(html).toContain("Alex Chen");
    expect(html).toContain("Maya Lin");
    expect(text).toContain("Alex Chen");
    // Heading is rendered into HTML but @react-email/render's plain-
    // text mode trims headings + preview. Assert on body copy instead.
    expect(text).toContain("begins shortly");
  });
});

describe("bookings.create — reminder scheduling", () => {
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

  it("schedules a booking-reminder Task at slotStart - 1h", async () => {
    const slotStart = tomorrowAtMinute(0);
    const caller = callRouter(fakeContext({}));
    await caller.bookings.create({
      handle: host.handle,
      slotStart: slotStart.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const reminderTasks = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: { payload: true, scheduledAt: true, referenceUid: true },
    });
    const reminder = reminderTasks.find((t) =>
      t.referenceUid?.includes(":email:booking-reminder:"),
    );
    expect(reminder).toBeDefined();
    if (!reminder) return;

    const payload = JSON.parse(reminder.payload) as EmailSendPayload;
    expect(payload.template).toBe("booking-reminder");
    expect(payload.to).toBe("maya@example.com");

    // scheduledAt = slotStart - 1h (allow ±1s for clock drift inside
    // the procedure between the Date.now() check and the row write).
    const expected = slotStart.getTime() - ONE_HOUR_MS;
    const actual = reminder.scheduledAt.getTime();
    expect(Math.abs(actual - expected)).toBeLessThan(1000);
  });
});

describe("bookings.cancel — reminder cancellation", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-cancel`);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("marks the pending reminder as superseded (succeededAt set, no actual send)", async () => {
    const visitorCaller = callRouter(fakeContext({}));
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    // Confirm pre-cancel state: reminder pending (succeededAt null).
    const before = await prisma.task.findFirstOrThrow({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: `${created.publicUid}:email:booking-reminder:visitor`,
      },
      select: { succeededAt: true, lastError: true },
    });
    expect(before.succeededAt).toBeNull();

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: created.publicUid });

    const after = await prisma.task.findFirstOrThrow({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: `${created.publicUid}:email:booking-reminder:visitor`,
      },
      select: { succeededAt: true, lastError: true },
    });
    expect(after.succeededAt).not.toBeNull();
    expect(after.lastError).toMatch(/superseded|cancelled/i);
  });
});

describe("bookings.reschedule — reminder swap", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-resched`);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("supersedes the old reminder and schedules a new one for the new slot", async () => {
    const visitorCaller = callRouter(fakeContext({}));
    const original = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const newSlot = tomorrowAtMinute(30);
    const result = await visitorCaller.bookings.reschedule({
      oldPublicUid: original.publicUid,
      newSlotStart: newSlot.toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });

    // Old reminder superseded.
    const oldReminder = await prisma.task.findFirstOrThrow({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: `${original.publicUid}:email:booking-reminder:visitor`,
      },
      select: { succeededAt: true },
    });
    expect(oldReminder.succeededAt).not.toBeNull();

    // New reminder enqueued for the new booking, scheduledAt = newSlot - 1h.
    const newReminder = await prisma.task.findFirstOrThrow({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: `${result.publicUid}:email:booking-reminder:visitor`,
      },
      select: { succeededAt: true, scheduledAt: true, payload: true },
    });
    expect(newReminder.succeededAt).toBeNull();

    const expected = newSlot.getTime() - ONE_HOUR_MS;
    expect(
      Math.abs(newReminder.scheduledAt.getTime() - expected),
    ).toBeLessThan(1000);

    const payload = JSON.parse(newReminder.payload) as EmailSendPayload;
    expect(payload.template).toBe("booking-reminder");
    if (payload.template === "booking-reminder") {
      // Discriminated narrow only works through structural cast here
      // (see notes in bookings-reschedule.test.ts).
      const props = payload.props as { slotStartIso: string };
      expect(props.slotStartIso).toBe(newSlot.toISOString());
    }
  });
});
