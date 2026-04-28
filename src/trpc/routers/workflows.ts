import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { planForUser, requireFeature } from "@/lib/billing";
import { privateProcedure, router } from "@/trpc/trpc";

// Workflow sub-router (B4). User-configurable automation rules
// (trigger × action × offset). Procedures are user-scoped — a host
// can only see + edit their own rules. The engine in
// src/lib/workflows.ts consumes these rows on every booking event.
const workflowTriggerSchema = z.enum([
  "BEFORE_EVENT",
  "EVENT_CREATED",
  "EVENT_CANCELLED",
  "EVENT_RESCHEDULED",
]);
const workflowActionSchema = z.enum([
  "EMAIL_VISITOR",
  "EMAIL_HOST",
  "WEBHOOK_FIRE",
]);

export const workflows = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.workflow.findMany({
      where: { userId: ctx.user.id },
      select: {
        id: true,
        name: true,
        trigger: true,
        offsetMinutes: true,
        action: true,
        template: true,
        webhookEvent: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: privateProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        trigger: workflowTriggerSchema,
        // 0 minutes = "fire at slotStart exactly" (BEFORE_EVENT) or
        // ignored (other triggers). Capped at 1 week so a typo
        // doesn't enqueue a Task that sits in the queue for years.
        offsetMinutes: z.number().int().min(0).max(7 * 24 * 60),
        action: workflowActionSchema,
        template: z.string().min(1).max(60).optional(),
        webhookEvent: z.string().min(1).max(60).optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // A3 — plan-gated feature. PRO+ only. Workflows are user-scoped
      // today; gate via the user's primary owned workspace's plan
      // until B1 finishes the workspace migration. The default 1h
      // reminder seeded at register (auth.register) bypasses this
      // gate (system-internal write directly via prisma) — every
      // user keeps the seeded default; only ADDITIONAL workflow
      // creation hits the gate.
      const plan = await planForUser(ctx.user.id);
      requireFeature(plan, "workflows");

      // Cross-field validation: EMAIL_* needs a template; WEBHOOK_FIRE
      // needs a webhookEvent. Caught here so the engine doesn't have
      // to defend against malformed rows on every dispatch.
      if (
        (input.action === "EMAIL_VISITOR" || input.action === "EMAIL_HOST") &&
        !input.template
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "EMAIL_* actions require a template name",
        });
      }
      if (input.action === "WEBHOOK_FIRE" && !input.webhookEvent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "WEBHOOK_FIRE actions require a webhookEvent",
        });
      }

      return prisma.workflow.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          trigger: input.trigger,
          offsetMinutes:
            input.trigger === "BEFORE_EVENT" ? input.offsetMinutes : 0,
          action: input.action,
          template: input.template ?? null,
          webhookEvent: input.webhookEvent ?? null,
          active: input.active,
        },
        select: {
          id: true,
          name: true,
          trigger: true,
          offsetMinutes: true,
          action: true,
          template: true,
          webhookEvent: true,
          active: true,
        },
      });
    }),

  update: privateProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        offsetMinutes: z
          .number()
          .int()
          .min(0)
          .max(7 * 24 * 60)
          .optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.workflow.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.offsetMinutes !== undefined
            ? { offsetMinutes: input.offsetMinutes }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      return { ok: true as const };
    }),

  delete: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.workflow.deleteMany({
        where: { id: input.id, userId: ctx.user.id },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      return { ok: true as const };
    }),
});
