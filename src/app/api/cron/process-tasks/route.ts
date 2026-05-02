import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getCalendarAdapter } from "@/lib/calendar";
import type {
  CalendarWritePayload,
  EmailSendPayload,
} from "@/lib/tasks";
import { signWebhookBody } from "@/lib/webhook-signature";

const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";
const TASK_TYPE_EMAIL_SEND = "emailSend";
const TASK_TYPE_CALENDAR_WRITE = "calendarWrite";
const MAX_TASKS_PER_RUN = 25;

function nextRetryAt(attempts: number): Date {
  const baseMinutes = 5;
  const cappedMinutes = Math.min(baseMinutes * 2 ** attempts, 60);
  return new Date(Date.now() + cappedMinutes * 60_000);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }
  const got = request.headers.get("authorization");
  return got === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const due = await prisma.task.findMany({
    where: {
      succeededAt: null,
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: MAX_TASKS_PER_RUN,
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const task of due) {
    if (task.attempts >= task.maxAttempts) continue;
    processed++;

    if (task.type === TASK_TYPE_WEBHOOK_DELIVERY) {
      const result = await runWebhookDelivery(task);
      if (result === "ok") succeeded++;
      else failed++;
    } else if (task.type === TASK_TYPE_EMAIL_SEND) {
      const result = await runEmailSend(task);
      if (result === "ok") succeeded++;
      else failed++;
    } else if (task.type === TASK_TYPE_CALENDAR_WRITE) {
      const result = await runCalendarWrite(task);
      if (result === "ok") succeeded++;
      else failed++;
    } else {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          attempts: task.maxAttempts,
          lastError: `Unknown task type: ${task.type}`,
          lastFailedAttemptAt: new Date(),
        },
      });
      failed++;
    }
  }

  return Response.json({ ran: now.toISOString(), processed, succeeded, failed });
}

async function runWebhookDelivery(task: {
  id: number;
  payload: string;
  attempts: number;
}): Promise<"ok" | "fail"> {
  let payload: {
    webhookSubscriptionId: number;
    event: string;
    body: Record<string, unknown>;
  };
  try {
    payload = JSON.parse(task.payload);
  } catch {
    return markFailed(task.id, task.attempts, "Invalid task payload JSON");
  }

  const sub = await prisma.webhookSubscription.findUnique({
    where: { id: payload.webhookSubscriptionId },
    select: { subscriberUrl: true, secret: true, active: true },
  });
  if (!sub) {
    return markPermanentlyFailed(task.id, "Webhook subscription deleted");
  }
  if (!sub.active) {
    return markPermanentlyFailed(task.id, "Webhook subscription inactive");
  }

  const bodyString = JSON.stringify(payload.body);
  const signature = await signWebhookBody(sub.secret, bodyString);

  let response: Response;
  try {
    response = await fetch(sub.subscriberUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Officehours-Webhook/1.0",
        "X-Officehours-Event": payload.event,
        "X-Officehours-Signature": signature,
      },
      body: bodyString,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markFailed(task.id, task.attempts, `Network error: ${message}`);
  }

  if (response.status >= 200 && response.status < 300) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        succeededAt: new Date(),
        attempts: task.attempts + 1,
        lastResponseStatus: response.status,
      },
    });
    return "ok";
  }

  if (response.status === 410) {
    await prisma.webhookSubscription.update({
      where: { id: payload.webhookSubscriptionId },
      data: { active: false },
    });
    return markPermanentlyFailed(
      task.id,
      "Receiver returned 410 GONE; subscription disabled",
      response.status,
    );
  }

  return markFailed(
    task.id,
    task.attempts,
    `Receiver returned ${response.status}`,
    response.status,
  );
}

async function runEmailSend(task: {
  id: number;
  payload: string;
  attempts: number;
}): Promise<"ok" | "fail"> {
  let payload: EmailSendPayload;
  try {
    payload = JSON.parse(task.payload) as EmailSendPayload;
  } catch {
    return markFailed(task.id, task.attempts, "Invalid email task payload JSON");
  }

  const result = await sendEmail({
    to: payload.to,
    template: payload.template,
    props: payload.props,
  });

  if (result.ok) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        succeededAt: new Date(),
        attempts: task.attempts + 1,
      },
    });
    return "ok";
  }

  if (result.reason === "no-key") {
    return markPermanentlyFailed(task.id, "RESEND_API_KEY not configured");
  }

  const errMessage =
    result.error instanceof Error
      ? result.error.message
      : typeof result.error === "string"
        ? result.error
        : "Resend send failed";
  return markFailed(task.id, task.attempts, errMessage);
}

async function runCalendarWrite(task: {
  id: number;
  payload: string;
  attempts: number;
}): Promise<"ok" | "fail"> {
  let payload: CalendarWritePayload;
  try {
    payload = JSON.parse(task.payload) as CalendarWritePayload;
  } catch {
    return markFailed(task.id, task.attempts, "Invalid calendar task payload JSON");
  }

  const booking = await prisma.booking.findUnique({
    where: { publicUid: payload.bookingPublicUid },
    select: {
      visitorName: true,
      visitorEmail: true,
      question: true,
      slotStart: true,
      slotEnd: true,
      hostId: true,
      externalCalendarEventId: true,
      externalCalendarCredentialId: true,
      host: { select: { name: true, handle: true } },
    },
  });
  if (!booking) {
    return markPermanentlyFailed(
      task.id,
      "Booking not found (deleted before calendar write ran)",
    );
  }

  let credentialId = booking.externalCalendarCredentialId;
  let calendarId: string | null = null;
  if (payload.action === "create") {
    const primary = await primaryCalendarFor(booking.hostId);
    if (!primary) {
      return markPermanentlyFailed(
        task.id,
        "Host has no connected calendar; calendar write skipped",
      );
    }
    credentialId = primary.credentialId;
    calendarId = primary.externalCalendarId;
  } else {
    if (!credentialId || !booking.externalCalendarEventId) {
      return markPermanentlyFailed(
        task.id,
        "Booking has no recorded calendar event; nothing to update/delete",
      );
    }
    const primary = await primarySelectedCalendarFor(credentialId);
    if (!primary) {
      return markPermanentlyFailed(
        task.id,
        "Recorded credential has no selected calendar",
      );
    }
    calendarId = primary.externalCalendarId;
  }

  const credential = await prisma.calendarCredential.findUnique({
    where: { id: credentialId! },
    select: { id: true, provider: true },
  });
  if (!credential) {
    return markPermanentlyFailed(
      task.id,
      "Calendar credential disconnected before task ran",
    );
  }
  const adapter = getCalendarAdapter(credential.id, credential.provider);
  if (!adapter) {
    return markPermanentlyFailed(
      task.id,
      `${credential.provider} OAuth not configured`,
    );
  }

  const hostLabel = booking.host?.name ?? booking.host?.handle ?? "Host";
  const eventInput = {
    calendarId: calendarId!,
    title: `Office hours with ${booking.visitorName}`,
    description: booking.question ?? `Booked via ${hostLabel}'s page`,
    start: booking.slotStart,
    end: booking.slotEnd,
    attendeeEmail: booking.visitorEmail,
    attendeeName: booking.visitorName,
  };

  try {
    if (payload.action === "create") {
      const { externalEventId } = await adapter.createEvent(eventInput);
      await prisma.booking.update({
        where: { publicUid: payload.bookingPublicUid },
        data: {
          externalCalendarEventId: externalEventId,
          externalCalendarCredentialId: credential.id,
        },
      });
    } else if (payload.action === "update") {
      await adapter.updateEvent(
        booking.externalCalendarEventId!,
        eventInput,
      );
    } else if (payload.action === "delete") {
      await adapter.deleteEvent({
        calendarId: calendarId!,
        externalEventId: booking.externalCalendarEventId!,
      });
      await prisma.booking.update({
        where: { publicUid: payload.bookingPublicUid },
        data: { externalCalendarEventId: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markFailed(task.id, task.attempts, `Adapter error: ${message}`);
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { succeededAt: new Date(), attempts: task.attempts + 1 },
  });
  return "ok";
}

async function primaryCalendarFor(hostId: string): Promise<
  { credentialId: string; externalCalendarId: string } | null
> {
  const credential = await prisma.calendarCredential.findFirst({
    where: { userId: hostId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!credential) return null;
  const selected = await primarySelectedCalendarFor(credential.id);
  if (!selected) return null;
  return { credentialId: credential.id, externalCalendarId: selected.externalCalendarId };
}

async function primarySelectedCalendarFor(
  credentialId: string,
): Promise<{ externalCalendarId: string } | null> {
  const primary = await prisma.selectedCalendar.findFirst({
    where: { credentialId, isPrimary: true },
    select: { externalCalendarId: true },
  });
  if (primary) return primary;
  return prisma.selectedCalendar.findFirst({
    where: { credentialId },
    select: { externalCalendarId: true },
  });
}

async function markFailed(
  taskId: number,
  prevAttempts: number,
  reason: string,
  responseStatus?: number,
): Promise<"fail"> {
  const nextAttempts = prevAttempts + 1;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      attempts: nextAttempts,
      lastError: reason,
      lastFailedAttemptAt: new Date(),
      ...(typeof responseStatus === "number"
        ? { lastResponseStatus: responseStatus }
        : {}),
      scheduledAt: nextRetryAt(nextAttempts),
    },
  });
  return "fail";
}

async function markPermanentlyFailed(
  taskId: number,
  reason: string,
  responseStatus?: number,
): Promise<"fail"> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      attempts: { increment: 999 },
      lastError: reason,
      lastFailedAttemptAt: new Date(),
      ...(typeof responseStatus === "number"
        ? { lastResponseStatus: responseStatus }
        : {}),
    },
  });
  return "fail";
}

