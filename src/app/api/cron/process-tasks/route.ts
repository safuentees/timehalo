import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getCalendarAdapter } from "@/lib/calendar";
import type {
  CalendarWritePayload,
  EmailSendPayload,
} from "@/lib/tasks";
import { signWebhookBody } from "@/lib/webhook-signature";

// Cron processor — drains due Task rows. Vercel Cron pings this on a
// schedule (see vercel.json). Locally, simulate by curl'ing it with
// the CRON_SECRET header.
//
// Pattern reference: cal.com's packages/features/tasker/task-processor.ts
// + tasks/index.ts (webhookDelivery: maxAttempts: 3,
// minRetryIntervalMins: 5). Same shape: pick due tasks, dispatch by
// type, on success mark succeededAt, on failure increment attempts and
// reschedule with backoff. After maxAttempts, the row stops retrying
// (`attempts >= maxAttempts AND succeededAt IS NULL` is the
// permanently-failed predicate).
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Any
// request without the matching secret gets a 401, so a public hit
// can't burn through tasks.

const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";
const TASK_TYPE_EMAIL_SEND = "emailSend";
const TASK_TYPE_CALENDAR_WRITE = "calendarWrite";
const MAX_TASKS_PER_RUN = 25;

// Exponential backoff anchored at 5 minutes: 5m, 10m, 20m, 40m...
// Caps at 60 minutes so a long-running outage doesn't push retries
// out by hours. Matches cal.com's minRetryIntervalMins: 5 baseline.
function nextRetryAt(attempts: number): Date {
  const baseMinutes = 5;
  const cappedMinutes = Math.min(baseMinutes * 2 ** attempts, 60);
  return new Date(Date.now() + cappedMinutes * 60_000);
}

function isAuthorized(request: Request): boolean {
  // CRON_SECRET stays on raw process.env — Vercel cron + tests both
  // mutate it post-import, and t3-env snapshots at module load. The
  // schema in src/env.ts still documents it for ops handoff.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured — refuse to run rather than silently
    // exposing the endpoint. Mirrors how Vercel's own examples handle
    // it: never leave the cron route unauthenticated.
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
      // Don't re-pick rows that have hit max attempts — they're done.
      // SQLite/Prisma doesn't support a column-to-column comparison
      // in `where`, so this filter runs in JS below.
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
      // Unknown type — mark as permanently failed so it doesn't loop
      // forever. The unique constraint on (referenceUid, type)
      // prevents the trigger from re-scheduling unintentionally.
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

  // Stringify the body EXACTLY ONCE. The string we hash must be the
  // same bytes the receiver receives, so do not let JSON.stringify
  // run twice with different whitespace.
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
      // 10s timeout — receivers shouldn't take longer to ack. Failed
      // delivery becomes a retry; a slow receiver doesn't stall the
      // whole cron run. AbortSignal.timeout is supported by undici
      // (Node 18+) which is what Next 16 uses.
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
        // B.PT78 — capture the actual response code on success too,
        // so the booking-detail UI can show "✓ 204" or "✓ 200" rather
        // than a generic checkmark.
        lastResponseStatus: response.status,
      },
    });
    return "ok";
  }

  // 410 GONE — receiver explicitly says "stop sending." Match dub.co's
  // pattern (apps/web/app/api/webhooks/callback/route.ts) — auto-mark
  // the subscription inactive so we don't waste cycles. Visible in
  // the host's webhook list as `active: false`.
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

  // RESEND_API_KEY missing — treat as a permanent skip rather than a
  // retryable failure. Otherwise the cron would loop forever on every
  // tick across an unconfigured env.
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

  // Look up the booking — its slot times are the source of truth
  // for the event body. The booking carries the
  // externalCalendarCredentialId we need to pick the adapter.
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

  // CREATE picks the host's primary credential + its primary
  // selected calendar. UPDATE / DELETE use whatever was recorded
  // on the booking when CREATE ran. If the host has no connected
  // calendar at CREATE time, we permanently skip — there's nothing
  // to write to and nothing to track.
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
      // Nothing was ever written — nothing to update / delete.
      return markPermanentlyFailed(
        task.id,
        "Booking has no recorded calendar event; nothing to update/delete",
      );
    }
    // Pull the calendar id from any selected calendar on the
    // recorded credential — match the one whose externalCalendarId
    // we'd have used at create time. Since SelectedCalendar is
    // unique per credential, the primary stays consistent.
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
      // Clear the pointer so re-running cancel is a no-op (the
      // recorded-event check above flips to "nothing to delete").
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

// Pick the host's "destination" calendar — the primary calendar of
// the host's earliest-connected credential. Caller checks for null
// when the host has no connected calendar at all.
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
  // Prefer the row with isPrimary=true; fall back to any selected
  // calendar so a host who didn't explicitly mark a primary still
  // gets the write directed somewhere.
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
  // Optional HTTP status code (B.PT78). Webhook delivery failure paths
  // pass the receiver's response code; non-network task types (email,
  // calendar) pass undefined and the field stays untouched.
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
      // Reschedule the next attempt; the cron picks it back up when
      // scheduledAt <= now. If max attempts hit, scheduledAt is
      // moved far enough out that even a paranoid cron won't grab it
      // (the `attempts >= maxAttempts` check will skip it anyway).
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
      // Hop to maxAttempts so the row is excluded from future runs.
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

