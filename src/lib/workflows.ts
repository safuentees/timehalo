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

const log = createLogger("workflows");

const TEMPLATE_NAMES = new Set<TemplateName>([
  "booking-created",
  "booking-cancelled",
  "booking-cancelled-host",
  "booking-rescheduled",
  "booking-reminder",
  "account-deleted",
  "workspace-invite",
  "magic-link-signin",
]);

function isKnownTemplate(name: string | null): name is TemplateName {
  if (!name) return false;
  return TEMPLATE_NAMES.has(name as TemplateName);
}

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
  operationId: string;
};

export type WorkflowDispatchOpts = {
  trigger: WorkflowTrigger;
  booking: WorkflowBookingContext;
  oldSlotStartIso?: string;
};

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

  let scheduledAt: Date | undefined;
  if (opts.trigger === "BEFORE_EVENT") {
    const slotMs = new Date(opts.booking.slotStartIso).getTime();
    const fireAt = new Date(slotMs - w.offsetMinutes * 60_000);
    if (fireAt.getTime() <= Date.now()) {
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
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
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
    case "magic-link-signin":
      return null;
  }
}

export const DEFAULT_REMINDER_WORKFLOW = {
  name: "1h reminder",
  trigger: "BEFORE_EVENT" as const,
  offsetMinutes: 60,
  action: "EMAIL_VISITOR" as const,
  template: "booking-reminder" as const,
  active: true,
} as const;

export async function hasMatchingReminderWorkflow(
  userId: string,
): Promise<boolean> {
  const row = await prisma.workflow.findFirst({
    where: {
      userId,
      active: true,
      trigger: "BEFORE_EVENT",
      action: "EMAIL_VISITOR",
      template: DEFAULT_REMINDER_WORKFLOW.template,
    },
    select: { id: true },
  });
  return row !== null;
}

export async function cancelPendingWorkflowTasks(
  bookingPublicUid: string,
): Promise<number> {
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
  void cancelPendingTask;
  return result.count;
}
