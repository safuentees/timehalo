import { prisma } from "@/lib/prisma";
import { signWebhookBody } from "@/lib/webhook-signature";

const TASK_TYPE_WEBHOOK_DELIVERY = "webhookDelivery";
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
    );
  }

  return markFailed(
    task.id,
    task.attempts,
    `Receiver returned ${response.status}`,
  );
}

async function markFailed(
  taskId: number,
  prevAttempts: number,
  reason: string,
): Promise<"fail"> {
  const nextAttempts = prevAttempts + 1;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      attempts: nextAttempts,
      lastError: reason,
      lastFailedAttemptAt: new Date(),
      scheduledAt: nextRetryAt(nextAttempts),
    },
  });
  return "fail";
}

async function markPermanentlyFailed(
  taskId: number,
  reason: string,
): Promise<"fail"> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      attempts: { increment: 999 },
      lastError: reason,
      lastFailedAttemptAt: new Date(),
    },
  });
  return "fail";
}

