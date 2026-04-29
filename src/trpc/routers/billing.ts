import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Stripe from "stripe";
import type { PlanTier } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { hasScope, workspaceSlugSchema } from "@/lib/workspaces";
import { planForWorkspace } from "@/lib/billing";
import { privateProcedure, router } from "@/trpc/trpc";

const planSchema = z.enum(["PRO", "TEAM"]);

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Stripe is not configured. Set STRIPE_SECRET_KEY (and the " +
        "STRIPE_PRICE_* env vars) to enable billing.",
    });
  }
  _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return _stripe;
}

function priceIdForPlan(plan: "PRO" | "TEAM"): string {
  const id = plan === "PRO" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_TEAM;
  if (!id) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `STRIPE_PRICE_${plan} is not configured.`,
    });
  }
  return id;
}

async function requireBillingScope(opts: {
  slug: string;
  userId: string;
}): Promise<{ workspaceId: string }> {
  const ws = await prisma.workspace.findUnique({
    where: { slug: opts.slug },
    select: {
      id: true,
      memberships: {
        where: { userId: opts.userId },
        select: { role: true },
      },
    },
  });
  if (!ws || ws.memberships.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workspace not found",
    });
  }
  const role = ws.memberships[0].role;
  if (!hasScope(role, "workspace.write")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role (${role}) cannot manage billing.`,
    });
  }
  return { workspaceId: ws.id };
}

export const billing = router({
  currentPlan: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const { workspaceId } = await requireBillingScope({
        slug: input.slug,
        userId: ctx.user.id,
      });
      const plan: PlanTier = await planForWorkspace(workspaceId);
      const sub = await prisma.subscription.findUnique({
        where: { workspaceId },
        select: {
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          stripeCustomerId: true,
        },
      });
      return {
        plan,
        status: sub?.status ?? "ACTIVE",
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        hasStripeCustomer: Boolean(sub?.stripeCustomerId),
      };
    }),

  startCheckout: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        plan: planSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireBillingScope({
        slug: input.slug,
        userId: ctx.user.id,
      });

      const stripe = getStripe();
      const priceId = priceIdForPlan(input.plan);
      const appUrl =
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      const existing = await prisma.subscription.findUnique({
        where: { workspaceId },
        select: { stripeCustomerId: true },
      });

      const me = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { email: true },
      });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings?billing=success`,
        cancel_url: `${appUrl}/settings?billing=cancelled`,
        client_reference_id: workspaceId,
        metadata: { workspaceId, plan: input.plan },
        subscription_data: {
          metadata: { workspaceId, plan: input.plan },
        },
        ...(existing?.stripeCustomerId
          ? { customer: existing.stripeCustomerId }
          : me?.email
            ? { customer_email: me.email }
            : {}),
      });
      if (!session.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe did not return a checkout URL.",
        });
      }
      return { url: session.url };
    }),

  openPortal: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireBillingScope({
        slug: input.slug,
        userId: ctx.user.id,
      });

      const sub = await prisma.subscription.findUnique({
        where: { workspaceId },
        select: { stripeCustomerId: true },
      });
      if (!sub?.stripeCustomerId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No Stripe customer for this workspace. Start a checkout first.",
        });
      }

      const stripe = getStripe();
      const appUrl =
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${appUrl}/settings`,
      });
      return { url: session.url };
    }),
});
