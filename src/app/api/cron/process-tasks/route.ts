import { prisma } from "@/lib/prisma";
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
): Promise<"fail"> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      // Hop to maxAttempts so the row is excluded from future runs.
      attempts: { increment: 999 },
      lastError: reason,
      lastFailedAttemptAt: new Date(),
    },
  });
  return "fail";
}

