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

// B3 — Stripe checkout + portal procedures. Closes 6d37510's
// WHAT'S DEFERRED:
//
//   "Live checkout / customer-portal session creation. The webhook
//   receives + persists state; minting a checkout session needs a
//   Stripe.com account + product config. Add when shop story
//   lands."
//
//   "tRPC procedures for 'current plan', 'start checkout', 'open
//   portal'. Schema + read paths exist; the wrappers are
//   mechanical."
//
//   "Customer portal URL helper."
//
// Operator setup (one-time):
//   1. Create products + prices in the Stripe dashboard. One price
//      per plan tier (Pro, Team).
//   2. Set env: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO,
//      STRIPE_PRICE_TEAM, STRIPE_WEBHOOK_SECRET.
//   3. Configure the Customer Portal in Stripe (cancellation, plan
//      change rules) — Stripe-hosted, no code needed.
//
// When STRIPE_SECRET_KEY is unset, every procedure here throws
// PRECONDITION_FAILED with a clear message. Mirrors the
// calendar.authUrl pattern from B3 (provider-not-configured).

const planSchema = z.enum(["PRO", "TEAM"]);

// Lazy Stripe client — instantiated only when the secret is set so
// importing this module on a fresh clone (no Stripe env) doesn't
// throw at module load. The cast through `as` is required because
// Stripe.Stripe expects a non-empty string at construction.
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
  // No apiVersion override — let the SDK pin to its bundled default
  // so we don't drift on minor SDK upgrades.
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

// Workspace + scope guard. workspace.write covers billing — only
// OWNER/ADMIN should be able to swap plans or open the portal.
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
  // Read-side: current plan + period end. No side effects, no
  // Stripe calls — reads the locally-mirrored Subscription row.
  // Useful for `/settings/billing` plan badge + "renews on X" copy.
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
        // Surfacing this lets the UI decide whether to show the
        // "Manage billing" portal button (only valid post-checkout
        // when a customer id exists).
        hasStripeCustomer: Boolean(sub?.stripeCustomerId),
      };
    }),

  // Mint a Stripe URL for the requested plan transition. Branches:
  //
  //   1. **No active subscription** (FREE / canceled / never-paid):
  //      mint a Stripe Checkout Session. The webhook handler at
  //      /api/stripe/webhook persists the resulting Subscription
  //      row when Stripe fires `checkout.session.completed`.
  //
  //   2. **Active subscription** (PRO ↔ TEAM, etc.): mint a Stripe
  //      Customer Portal session in `subscription_update_confirm`
  //      flow (B.PT89). Stripe's canonical pattern for plan switches
  //      when an active subscription exists (`/billing/subscriptions/
  //      upgrade-downgrade`) — without this branch, creating a new
  //      Checkout Session results in TWO parallel subscriptions on
  //      the same customer, billing the user for both. The portal
  //      page shows proration preview + user explicit confirmation,
  //      and on confirm Stripe fires `customer.subscription.updated`
  //      which our webhook handler upserts in place.
  //
  // Pattern reference: dub apps/web/app/api/workspaces/[idOrSlug]/
  // billing/upgrade/route.ts:60-79 — same branch + same `flow_data`
  // shape. cal.com routes orgs/teams URL-first so they don't have
  // the same shape.
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
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

      // Read the locally-mirrored Subscription row (B3 invariant —
      // the row reflects whatever Stripe last fired through the
      // webhook). stripeSubscriptionId is the bridge to the active
      // subscription; stripeCustomerId is required for the portal
      // session.
      const existing = await prisma.subscription.findUnique({
        where: { workspaceId },
        select: {
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });

      // ─── Plan switch path: active subscription → Customer Portal ──
      if (
        existing?.stripeCustomerId &&
        existing.stripeSubscriptionId
      ) {
        // Verify the subscription is actually live in Stripe before
        // routing to the portal. The local mirror can drift if
        // webhook events were missed (e.g. Cloudflare Access
        // intercepting `/api/stripe/webhook`) — falling through to
        // Checkout when the live sub is canceled is the right
        // recovery, not crashing on a stale row.
        let active: Stripe.Subscription | null = null;
        try {
          active = await stripe.subscriptions.retrieve(
            existing.stripeSubscriptionId,
          );
        } catch {
          active = null;
        }
        const isActive =
          active?.status === "active" || active?.status === "trialing";
        if (active && isActive) {
          const itemId = active.items.data[0]?.id;
          if (!itemId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Active subscription has no items to update.",
            });
          }
          const session = await stripe.billingPortal.sessions.create({
            customer: existing.stripeCustomerId,
            return_url: `${appUrl}/settings/billing?billing=success`,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: active.id,
                items: [
                  { id: itemId, quantity: 1, price: priceId },
                ],
              },
            },
          });
          if (!session.url) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Stripe did not return a portal URL.",
            });
          }
          return { url: session.url };
        }
        // Fall through to Checkout Session — the local row points at
        // a Stripe sub that's no longer active (canceled, expired).
      }

      // ─── Initial-checkout path: no active subscription ──────────
      // Caller's email — useful for Stripe to pre-fill the checkout
      // form. Pulled from the session, not exposed to client.
      const me = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { email: true },
      });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings/billing?billing=success`,
        cancel_url: `${appUrl}/settings/billing?billing=cancelled`,
        // Bind the workspace to the session so the webhook handler
        // knows which Subscription row to upsert. metadata round-
        // trips through every event Stripe emits for this session.
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

  // Mint a Stripe Customer Portal session — Stripe-hosted page where
  // the user manages payment method, downloads invoices, and
  // upgrades/cancels their subscription. The portal's behavior
  // (cancellation flow, plan switch rules) is configured in the
  // Stripe dashboard, not here.
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
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${appUrl}/settings/billing`,
      });
      return { url: session.url };
    }),
});
