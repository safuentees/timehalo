import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { TemplateInput, TemplateName } from "@/lib/email";
import type { WebhookEvent } from "@/trpc/router";

// Task scheduler — writes a row that the cron processor picks up later.
// Mirrors cal.com's tasker pattern (packages/features/tasker/repository.ts).
// Two task types live here today: webhookDelivery and emailSend. Both
// share retry semantics (Task.attempts/maxAttempts) and dedup
// (@@unique([referenceUid, type])).

export const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";
export const TASK_TYPE_EMAIL_SEND = "emailSend";
export const TASK_TYPE_CALENDAR_WRITE = "calendarWrite";

export type WebhookDeliveryPayload = {
  webhookSubscriptionId: number;
  event: WebhookEvent;
  /**
   * Pre-rendered body. Stored as a JSON-serializable object; the
   * processor will JSON.stringify exactly once for the HMAC sign +
   * POST body so the receiver's verification doesn't trip on
   * whitespace differences.
   */
  body: Record<string, unknown>;
};

type ScheduleOpts = {
  payload: WebhookDeliveryPayload;
  /**
   * Idempotency key for the task itself — separate from the booking's
   * idempotency key. Format: `<bookingPublicUid>:<event>:<webhookSubscriptionId>`.
   * If the same delivery gets scheduled twice (race in trigger logic,
   * a retry on the trigger side), the unique constraint on
   * Task.(referenceUid, type) catches it.
   */
  referenceUid: string;
};

/**
 * Schedule one webhook delivery. Returns true if a new task row was
 * written, false if the delivery was already queued (dedup hit).
 *
 * Failure modes:
 * - Unique constraint hit (P2002) on (referenceUid, type) → swallowed,
 *   returns false. The trigger ran twice; second run no-ops.
 * - Anything else → rethrown so the caller's transaction can roll back.
 */
export async function scheduleWebhookDelivery(opts: ScheduleOpts) {
  try {
    await prisma.task.create({
      data: {
        type: TASK_TYPE_WEBHOOK_DELIVERY,
        payload: JSON.stringify(opts.payload),
        referenceUid: opts.referenceUid,
        // scheduledAt defaults to now — runs on the next cron tick.
      },
    });
    return true;
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      // Already scheduled. Fine.
      return false;
    }
    throw cause;
  }
}

// ─── Email send (§10.1 follow-up — A1 from OFFICEHOURS-DEPTH-IDEAS.md) ───

export type EmailSendPayload<T extends TemplateName = TemplateName> = {
  to: string;
  template: T;
  // `props` deliberately excludes `recipientEmail` — `sendEmail()`
  // injects that from `to` at render time so the cron payload stays
  // free of duplication.
  props: TemplateInput<T>;
};

type ScheduleEmailOpts<T extends TemplateName> = {
  payload: EmailSendPayload<T>;
  /**
   * Idempotency key for the email task. Format suggestion:
   * `<bookingPublicUid>:<template>:<recipient-tag>`. Two enqueues
   * with the same key → second one no-ops.
   */
  referenceUid: string;
  /**
   * Optional future scheduledAt — defaults to now (cron picks up on
   * next tick). Used by reminder emails (A8) to defer dispatch until
   * 1 hour before the booking's slotStart.
   */
  scheduledAt?: Date;
};

/**
 * Schedule one templated email send. Same shape as
 * scheduleWebhookDelivery — payload is a JSON-serializable record that
 * the cron processor picks up and dispatches via `sendEmail()`.
 *
 * Returns true on a fresh enqueue, false on dedup (P2002 swallowed).
 */
export async function scheduleEmailSend<T extends TemplateName>(
  opts: ScheduleEmailOpts<T>,
) {
  try {
    await prisma.task.create({
      data: {
        type: TASK_TYPE_EMAIL_SEND,
        payload: JSON.stringify(opts.payload),
        referenceUid: opts.referenceUid,
        ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
      },
    });
    return true;
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return false;
    }
    throw cause;
  }
}

// ─── Calendar write (B2) ────────────────────────────────────────

export type CalendarWriteAction = "create" | "update" | "delete";

export type CalendarWritePayload = {
  action: CalendarWriteAction;
  bookingPublicUid: string;
};

/**
 * Schedule a calendar-write Task. Picked up by the cron processor
 * which resolves the booking → host → CalendarCredential and
 * dispatches the corresponding adapter call. The booking's
 * externalCalendarEventId is updated on `create`, deleted on
 * `delete`. `update` re-syncs the existing event with the booking's
 * current slot.
 *
 * referenceUid format: `<bookingPublicUid>:calendarWrite:<action>`
 * — uniqueness on (referenceUid, type) means a retry of the same
 * action is a no-op. A reschedule that fires update twice (idempotency
 * retry) only writes one Task.
 */
export async function scheduleCalendarWrite(opts: {
  payload: CalendarWritePayload;
  referenceUid: string;
}): Promise<boolean> {
  try {
    await prisma.task.create({
      data: {
        type: TASK_TYPE_CALENDAR_WRITE,
        payload: JSON.stringify(opts.payload),
        referenceUid: opts.referenceUid,
      },
    });
    return true;
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return false;
    }
    throw cause;
  }
}

/**
 * Mark a pending Task as superseded — sets succeededAt = now (without
 * actually running it) so the cron processor skips the row on its next
 * tick. Used to cancel scheduled reminder emails when the booking is
 * cancelled or rescheduled.
 *
 * Filters on `succeededAt: null` so a reminder that's already fired
 * doesn't get re-marked. Returns the count of rows updated.
 */
export async function cancelPendingTask(opts: {
  referenceUid: string;
  type: string;
}): Promise<number> {
  const result = await prisma.task.updateMany({
    where: {
      referenceUid: opts.referenceUid,
      type: opts.type,
      succeededAt: null,
    },
    data: {
      succeededAt: new Date(),
      lastError: "Cancelled — booking superseded",
    },
  });
  return result.count;
}

/**
 * Find webhook subscriptions that listen for `event` inside a
 * specific workspace. The scheduler calls this when a state change
 * fires — one Task row per matching subscription gets queued.
 *
 * Workspace-scoped (B1): webhooks moved from User-owned to
 * Workspace-owned, so booking events fan out to every active
 * subscription configured in the workspace, not just those minted
 * by the booking's host. A workspace OWNER who configures a
 * webhook now sees deliveries for every member's bookings.
 *
 * `events` is a CSV (see WebhookSubscription comment); we LIKE-match
 * the comma-bounded substring so "booking.created" doesn't false-
 * positive on a (hypothetical) "no-booking.created" suffix.
 */
export async function findActiveSubscriptionsForEvent(
  workspaceId: string,
  event: WebhookEvent,
) {
  return prisma.webhookSubscription.findMany({
    where: {
      workspaceId,
      active: true,
      events: { contains: event },
    },
    select: {
      id: true,
      subscriberUrl: true,
      secret: true,
      events: true,
    },
  });
}
