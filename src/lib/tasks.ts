import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  TemplateName,
  TemplatePropsMap,
} from "@/lib/email";
import type { WebhookEvent } from "@/trpc/router";

export const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";
export const TASK_TYPE_EMAIL_SEND = "emailSend";

export type WebhookDeliveryPayload = {
  webhookSubscriptionId: number;
  event: WebhookEvent;
  body: Record<string, unknown>;
};

type ScheduleOpts = {
  payload: WebhookDeliveryPayload;
  referenceUid: string;
};

export async function scheduleWebhookDelivery(opts: ScheduleOpts) {
  try {
    await prisma.task.create({
      data: {
        type: TASK_TYPE_WEBHOOK_DELIVERY,
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

export type EmailSendPayload<T extends TemplateName = TemplateName> = {
  to: string;
  template: T;
  props: TemplatePropsMap[T];
};

type ScheduleEmailOpts<T extends TemplateName> = {
  payload: EmailSendPayload<T>;
  referenceUid: string;
  scheduledAt?: Date;
};

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

export async function findActiveSubscriptionsForEvent(
  userId: string,
  event: WebhookEvent,
) {
  return prisma.webhookSubscription.findMany({
    where: {
      userId,
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
