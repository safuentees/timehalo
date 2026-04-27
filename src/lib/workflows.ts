import "server-only";
import type {
  WorkflowAction,
  WorkflowTrigger,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import {
  cancelPendingTask,
  scheduleEmailSend,
  scheduleWebhookDelivery,
  TASK_TYPE_EMAIL_SEND,
} from "@/lib/tasks";
import type { TemplateName, TemplatePropsMap } from "@/lib/email";
import { createLogger } from "@/lib/logger";

// Workflow engine (B4). Generalizes the A8 reminder pattern into
// user-configurable rules. Rules live in the Workflow table; this
// module turns "user rule + booking event" into concrete
// emailSend / webhookDelivery Task rows.
//
// Design choices:
//   • No new Task type — workflows produce the existing two task
//     shapes the cron already knows how to dispatch.
//   • The hardcoded A8 reminder stays — it's the default for every
//     host. Workflow rows are PURELY ADDITIVE, so a host who hasn't
//     opened the workflow editor still gets the standard reminder.
//   • Per-trigger fan-out runs sequentially within dispatchWorkflows
//     — the per-rule Task enqueue is fast (one INSERT), so we don't
//     need parallelism. Sequential keeps the operationId thread
//     intact and ordering deterministic for tests.

const log = createLogger("workflows");

const TEMPLATE_NAMES = new Set<TemplateName>([
  "booking-created",
  "booking-cancelled",
  "booking-cancelled-host",
  "booking-rescheduled",
  "booking-reminder",
  "account-deleted",
  "workspace-invite",
]);

function isKnownTemplate(name: string | null): name is TemplateName {
  if (!name) return false;
  return TEMPLATE_NAMES.has(name as TemplateName);
}

// Booking context the engine needs to render any of the templates
// it might dispatch. Built once per booking event by the call site
// (bookings.create / cancel / reschedule).
export type WorkflowBookingContext = {
  bookingPublicUid: string;
  hostId: string;
  hostName: string;
  hostEmail: string | null;
  hostHandle: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStartIso: string;
  slotEndIso: string;
  // operationId from the calling procedure — threads into every
  // workflow's enqueued Task referenceUid for log correlation.
  operationId: string;
};

export type WorkflowDispatchOpts = {
  trigger: WorkflowTrigger;
  booking: WorkflowBookingContext;
  // Reschedule-only — needed by booking-rescheduled template.
  oldSlotStartIso?: string;
};

/**
 * Look up active workflows for the host on this trigger and
 * enqueue the appropriate Task rows. Returns the count of
 * successfully enqueued rules + the count of validation failures
 * (logged but not rethrown — one bad workflow shouldn't black out
 * the booking flow).
 */
export async function dispatchWorkflows(
  opts: WorkflowDispatchOpts,
): Promise<{ enqueued: number; skipped: number }> {
  const workflows = await prisma.workflow.findMany({
    where: {
      userId: opts.booking.hostId,
      trigger: opts.trigger,
      active: true,
    },
    select: {
      id: true,
      action: true,
      offsetMinutes: true,
      template: true,
      webhookEvent: true,
    },
  });

  let enqueued = 0;
  let skipped = 0;
  for (const w of workflows) {
    try {
      const ok = await dispatchOne(w, opts);
      if (ok) enqueued++;
      else skipped++;
    } catch (cause) {
      skipped++;
      log.error("workflow dispatch failed", {
        workflowId: w.id,
        trigger: opts.trigger,
        operationId: opts.booking.operationId,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return { enqueued, skipped };
}

async function dispatchOne(
  w: {
    id: string;
    action: WorkflowAction;
    offsetMinutes: number;
    template: string | null;
    webhookEvent: string | null;
  },
  opts: WorkflowDispatchOpts,
): Promise<boolean> {
  if (w.action === "WEBHOOK_FIRE") {
    if (!w.webhookEvent) {
      log.warn("workflow with WEBHOOK_FIRE missing webhookEvent", {
        workflowId: w.id,
      });
      return false;
    }
    // Workflow-driven webhook fan-out finds every active subscription
    // listening for this event on the host. The bookings procedures
    // already handle the canonical booking.* events on their hot
    // path; this branch lets a workflow fire a custom event name on
    // a different schedule (e.g. "before-event ping").
    const subs = await prisma.webhookSubscription.findMany({
      where: {
        userId: opts.booking.hostId,
        active: true,
        events: { contains: w.webhookEvent },
      },
      select: { id: true },
    });
    for (const sub of subs) {
      await scheduleWebhookDelivery({
        payload: {
          webhookSubscriptionId: sub.id,
          // The webhook table's events column is checked for
          // membership of the canonical types; workflow-fired
          // events don't have to be canonical, so we widen the
          // type at the call boundary.
          event: w.webhookEvent as "booking.created",
          body: {
            event: w.webhookEvent,
            workflowId: w.id,
            operationId: opts.booking.operationId,
            booking: {
              publicUid: opts.booking.bookingPublicUid,
              slotStart: opts.booking.slotStartIso,
              slotEnd: opts.booking.slotEndIso,
              visitorName: opts.booking.visitorName,
              visitorEmail: opts.booking.visitorEmail,
            },
            occurredAt: new Date().toISOString(),
          },
        },
        referenceUid: `${opts.booking.bookingPublicUid}:workflow:${w.id}:${sub.id}`,
      });
    }
    return true;
  }

  // EMAIL_VISITOR / EMAIL_HOST branch.
  if (!isKnownTemplate(w.template)) {
    log.warn("workflow with EMAIL_* missing or unknown template", {
      workflowId: w.id,
      template: w.template,
    });
    return false;
  }

  const recipient =
    w.action === "EMAIL_HOST"
      ? opts.booking.hostEmail
      : opts.booking.visitorEmail;
  if (!recipient) {
    log.warn("workflow EMAIL_* missing recipient address", {
      workflowId: w.id,
      action: w.action,
    });
    return false;
  }

  const props = buildTemplateProps(w.template, opts);
  if (!props) return false;

  // BEFORE_EVENT fires at slotStart - offsetMinutes; everything else
  // is immediate (scheduledAt defaults to now).
  let scheduledAt: Date | undefined;
  if (opts.trigger === "BEFORE_EVENT") {
    const slotMs = new Date(opts.booking.slotStartIso).getTime();
    const fireAt = new Date(slotMs - w.offsetMinutes * 60_000);
    if (fireAt.getTime() <= Date.now()) {
      // Already in the past — skip silently (booking too close to
      // start). Same skip A8 does.
      return false;
    }
    scheduledAt = fireAt;
  }

  await scheduleEmailSend({
    payload: {
      to: recipient,
      template: w.template,
      props: props as TemplatePropsMap[typeof w.template],
    },
    referenceUid: `${opts.booking.bookingPublicUid}:workflow:${w.id}:${opts.booking.operationId}`,
    scheduledAt,
  });
  return true;
}

function buildTemplateProps(
  template: TemplateName,
  opts: WorkflowDispatchOpts,
): TemplatePropsMap[TemplateName] | null {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const confirmationUrl = `${appUrl}/h/${opts.booking.hostHandle}/booked/${opts.booking.bookingPublicUid}`;

  switch (template) {
    case "booking-created":
      return {
        hostName: opts.booking.hostName,
        visitorName: opts.booking.visitorName,
        slotStartIso: opts.booking.slotStartIso,
        question: opts.booking.question,
        confirmationUrl,
      };
    case "booking-cancelled":
      return {
        hostName: opts.booking.hostName,
        visitorName: opts.booking.visitorName,
        slotStartIso: opts.booking.slotStartIso,
      };
    case "booking-cancelled-host":
      return {
        hostName: opts.booking.hostName,
        visitorName: opts.booking.visitorName,
        visitorEmail: opts.booking.visitorEmail,
        slotStartIso: opts.booking.slotStartIso,
      };
    case "booking-reminder":
      return {
        hostName: opts.booking.hostName,
        visitorName: opts.booking.visitorName,
        slotStartIso: opts.booking.slotStartIso,
        confirmationUrl,
      };
    case "booking-rescheduled":
      if (!opts.oldSlotStartIso) return null;
      return {
        hostName: opts.booking.hostName,
        visitorName: opts.booking.visitorName,
        oldSlotStartIso: opts.oldSlotStartIso,
        newSlotStartIso: opts.booking.slotStartIso,
        confirmationUrl,
      };
    case "account-deleted":
    case "workspace-invite":
      // Not booking-scoped; workflows can't dispatch them.
      return null;
  }
}

/**
 * Cancel pending workflow Tasks tied to a booking. Called from
 * bookings.cancel + bookings.reschedule so future BEFORE_EVENT
 * dispatches don't fire after the booking is gone. Pattern:
 * find by referenceUid prefix, mark succeededAt = now (matches
 * cancelPendingTask semantics).
 */
export async function cancelPendingWorkflowTasks(
  bookingPublicUid: string,
): Promise<number> {
  // updateMany with `referenceUid: { startsWith }` — SQLite supports
  // this via Prisma's contains/startsWith operators.
  const result = await prisma.task.updateMany({
    where: {
      type: TASK_TYPE_EMAIL_SEND,
      succeededAt: null,
      referenceUid: { startsWith: `${bookingPublicUid}:workflow:` },
    },
    data: {
      succeededAt: new Date(),
      lastError: "Cancelled — booking superseded",
    },
  });
  // cancelPendingTask is the per-row helper; this is the prefix-
  // match equivalent. Both leave succeededAt set so the cron skips.
  // Re-export so the call site doesn't need both imports.
  void cancelPendingTask;
  return result.count;
}
