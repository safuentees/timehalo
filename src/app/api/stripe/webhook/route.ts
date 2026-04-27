import { prisma } from "@/lib/prisma";
import {
  planFromStripePriceId,
  verifyStripeSignature,
} from "@/lib/billing";
import { createLogger } from "@/lib/logger";

const log = createLogger("stripe.webhook");

export const dynamic = "force-dynamic";

type StripeMinimalEvent = {
  id: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signingSecret) {
    log.warn("STRIPE_WEBHOOK_SECRET not set — refusing to process");
    return new Response("Stripe webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const verdict = verifyStripeSignature({
    rawBody,
    header: request.headers.get("stripe-signature"),
    signingSecret,
  });
  if (!verdict.valid) {
    log.warn("invalid signature", { reason: verdict.reason });
    return new Response(`Invalid signature: ${verdict.reason}`, {
      status: 400,
    });
  }

  let event: StripeMinimalEvent;
  try {
    event = JSON.parse(rawBody) as StripeMinimalEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    return Response.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    default:
      log.info("unhandled event type", { type: event.type });
  }

  return Response.json({ received: true });
}

async function handleSubscriptionUpsert(event: StripeMinimalEvent) {
  const obj = event.data?.object as
    | {
        id?: string;
        customer?: string;
        status?: string;
        current_period_end?: number;
        cancel_at_period_end?: boolean;
        items?: { data?: Array<{ price?: { id?: string } }> };
        metadata?: { workspaceId?: string };
      }
    | undefined;
  if (!obj) return;

  const workspaceId = obj.metadata?.workspaceId;
  if (!workspaceId) {
    log.warn("subscription event missing workspaceId metadata", {
      eventId: event.id,
    });
    return;
  }
  const priceId = obj.items?.data?.[0]?.price?.id ?? null;
  const plan = planFromStripePriceId(priceId);
  const status = mapStripeStatus(obj.status);
  const currentPeriodEnd = obj.current_period_end
    ? new Date(obj.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      stripeCustomerId: obj.customer ?? null,
      stripeSubscriptionId: obj.id ?? null,
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
    },
    update: {
      stripeCustomerId: obj.customer ?? undefined,
      stripeSubscriptionId: obj.id ?? undefined,
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
    },
  });
}

async function handleSubscriptionDeleted(event: StripeMinimalEvent) {
  const obj = event.data?.object as
    | { metadata?: { workspaceId?: string } }
    | undefined;
  const workspaceId = obj?.metadata?.workspaceId;
  if (!workspaceId) return;
  await prisma.subscription.update({
    where: { workspaceId },
    data: { plan: "FREE", status: "CANCELED" },
  });
}

function mapStripeStatus(
  s: string | undefined,
): "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
    default:
      return "INCOMPLETE";
  }
}
