import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { WebhookEvent } from "@/trpc/router";

const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";

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
