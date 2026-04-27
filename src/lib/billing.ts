import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanTier } from "@/generated/prisma/enums";

// Plan-feature matrix (C2). One source of truth for "what does
// plan X grant?" — every server-side check that gates on plan tier
// reads through hasFeature(plan, feature).
//
// Pattern reference: dub /apps/web/lib/api/rbac/permissions.ts at
// the role layer + /apps/web/lib/workspace-roles.ts at the plan
// layer. We collapse those into one shape since plan + role gating
// are independent in our model — plan controls "what can this
// workspace do", role (B1) controls "what can this user do inside
// the workspace".

export const PLAN_FEATURES = {
  FREE: new Set([
    "bookings.unlimited",
    "calendar.connect",
    "members.up-to-1",
  ]),
  PRO: new Set([
    "bookings.unlimited",
    "calendar.connect",
    "members.up-to-5",
    "webhooks",
    "api-keys",
    "workflows",
  ]),
  TEAM: new Set([
    "bookings.unlimited",
    "calendar.connect",
    "members.up-to-25",
    "webhooks",
    "api-keys",
    "workflows",
    "round-robin",
    "priority-support",
  ]),
} as const;

export type PlanFeature =
  | "bookings.unlimited"
  | "calendar.connect"
  | "members.up-to-1"
  | "members.up-to-5"
  | "members.up-to-25"
  | "webhooks"
  | "api-keys"
  | "workflows"
  | "round-robin"
  | "priority-support";

export function hasFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return (PLAN_FEATURES[plan] as ReadonlySet<string>).has(feature);
}

/**
 * Resolve the member-cap for a plan tier. Returns Infinity when no
 * cap applies (TEAM scaling is handled by manual approval, not the
 * matrix).
 */
export function memberCap(plan: PlanTier): number {
  if (hasFeature(plan, "members.up-to-25")) return 25;
  if (hasFeature(plan, "members.up-to-5")) return 5;
  return 1;
}

// ─── Stripe webhook signature verification ───────────────────────────
//
// Stripe signs every webhook with HMAC SHA-256 using the endpoint's
// signing secret. The `Stripe-Signature` header is a CSV of `t=…`
// (unix-seconds timestamp) + one or more `v1=…` (signature). We
// verify timing-safely against the timestamp + raw body.
//
// Pattern reference: dub apps/web/app/(ee)/api/stripe/webhook/route
// .ts:15-92. Same shape, no SDK dep — verifying is a 6-line crypto
// function.

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes — Stripe default

export function verifyStripeSignature(opts: {
  rawBody: string;
  header: string | null;
  signingSecret: string;
}): { valid: boolean; reason?: string } {
  if (!opts.header) return { valid: false, reason: "missing-header" };
  const parts = opts.header.split(",").map((p) => p.trim());
  let timestamp: string | null = null;
  const v1Sigs: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? null;
    else if (k === "v1" && v) v1Sigs.push(v);
  }
  if (!timestamp || v1Sigs.length === 0) {
    return { valid: false, reason: "malformed-header" };
  }
  // Replay protection — reject signatures whose timestamp drifts
  // outside the tolerance window. Stripe sends the timestamp inside
  // the signed string, so a clock-skewed but valid signature is
  // still rejected here.
  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: "stale" };
  }

  const expected = createHmac("sha256", opts.signingSecret)
    .update(`${timestamp}.${opts.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  // Multiple v1 sigs are possible during Stripe's secret rotation
  // window; accept any matching one.
  for (const sig of v1Sigs) {
    const candidate = Buffer.from(sig, "hex");
    if (
      candidate.length === expectedBuf.length &&
      timingSafeEqual(candidate, expectedBuf)
    ) {
      return { valid: true };
    }
  }
  return { valid: false, reason: "no-match" };
}

// ─── Plan derivation ─────────────────────────────────────────────────
//
// Translates a Stripe price/product id into a PlanTier. Configured
// via env (STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM) so swapping prices
// in Stripe doesn't require a code change. Defaults to FREE when
// the price isn't recognized.

export function planFromStripePriceId(priceId: string | null): PlanTier {
  if (!priceId) return "FREE";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "TEAM";
  return "FREE";
}
