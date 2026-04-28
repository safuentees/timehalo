import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { PlanTier } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

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

export function memberCap(plan: PlanTier): number {
  if (hasFeature(plan, "members.up-to-25")) return 25;
  if (hasFeature(plan, "members.up-to-5")) return 5;
  return 1;
}

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
  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: "stale" };
  }

  const expected = createHmac("sha256", opts.signingSecret)
    .update(`${timestamp}.${opts.rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

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

export function planFromStripePriceId(priceId: string | null): PlanTier {
  if (!priceId) return "FREE";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_TEAM) return "TEAM";
  return "FREE";
}

export async function planForWorkspace(workspaceId: string): Promise<PlanTier> {
  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: { plan: true, status: true, currentPeriodEnd: true },
  });
  if (!sub) return "FREE";
  if (sub.status === "CANCELED" && sub.currentPeriodEnd) {
    if (sub.currentPeriodEnd.getTime() < Date.now()) {
      return "FREE";
    }
  }
  return sub.plan;
}

export async function planForUser(userId: string): Promise<PlanTier> {
  const ws = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!ws) return "FREE";
  return planForWorkspace(ws.id);
}

export function requireFeature(
  plan: PlanTier,
  feature: PlanFeature,
): void {
  if (!hasFeature(plan, feature)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your plan (${plan}) does not include ${feature}.`,
    });
  }
}
