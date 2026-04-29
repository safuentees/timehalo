import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { planForWorkspace, requireFeature } from "@/lib/billing";
import { hasScope, workspaceSlugSchema } from "@/lib/workspaces";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { privateProcedure, router } from "@/trpc/trpc";

// Webhook sub-router. Workspace-scoped (B1). Every procedure takes
// a `slug` and gates on the caller's membership scope. The
// underlying `WebhookSubscription.userId` records who minted the
// row for audit; `workspaceId` is the access-control axis.

const webhookCreateSchema = z.object({
  slug: workspaceSlugSchema,
  subscriberUrl: z.string().url("Must be a valid https URL"),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pick at least one event"),
});

// Shared membership + scope check. NOT_FOUND when the workspace
// doesn't exist OR the caller isn't a member (no enumeration
// leak). FORBIDDEN when the role doesn't grant the scope. Mirrors
// requireMembership in workspaces.ts but lives here so webhooks.ts
// stays one import away from the workspace primitives.
async function requireWebhookScope(opts: {
  slug: string;
  userId: string;
  scope: "webhooks.read" | "webhooks.write";
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
  if (!hasScope(role, opts.scope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role (${role}) cannot ${opts.scope}.`,
    });
  }
  return { workspaceId: ws.id };
}

export const webhooks = router({
  list: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const { workspaceId } = await requireWebhookScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "webhooks.read",
      });
      return prisma.webhookSubscription.findMany({
        where: { workspaceId },
        // Never expose `secret` over the wire after creation. The host
        // got it once at create-time; if they lose it, they rotate by
        // deleting and re-creating.
        select: {
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: privateProcedure
    .input(webhookCreateSchema)
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWebhookScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "webhooks.write",
      });

      // A3 — plan-gated feature. PRO+ only. Now reads the workspace's
      // own plan directly (B1) instead of the user's primary plan.
      const plan = await planForWorkspace(workspaceId);
      requireFeature(plan, "webhooks");

      // 32 random bytes, hex-encoded — 64 chars. Cryptographically
      // suitable for HMAC SHA-256. randomBytes is sync and Node-only
      // which is fine here (procedure runs server-side).
      const { randomBytes } = await import("node:crypto");
      const secret = randomBytes(32).toString("hex");

      const created = await prisma.webhookSubscription.create({
        data: {
          userId: ctx.user.id,
          workspaceId,
          subscriberUrl: input.subscriberUrl,
          events: input.events.join(","),
          secret,
        },
        select: {
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          secret: true, // returned EXACTLY ONCE on create
          createdAt: true,
        },
      });
      return created;
    }),

  delete: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        publicUid: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWebhookScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "webhooks.write",
      });
      // deleteMany scoped to the workspace makes this safe even if a
      // visitor somehow guessed the publicUid — nothing happens.
      const result = await prisma.webhookSubscription.deleteMany({
        where: { publicUid: input.publicUid, workspaceId },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }
      return { ok: true as const };
    }),
});
