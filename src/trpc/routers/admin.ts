import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { FEATURE_DEFAULTS } from "@/lib/feature-flags";
import { adminProcedure, router } from "@/trpc/trpc";

export const admin = router({
  featureFlags: router({
    list: adminProcedure.query(async () => {
      const known = Object.keys(FEATURE_DEFAULTS) as Array<
        keyof typeof FEATURE_DEFAULTS
      >;
      const rows = await prisma.feature.findMany({
        where: { slug: { in: known } },
        select: {
          slug: true,
          enabled: true,
          type: true,
          description: true,
          assignments: {
            select: {
              user: { select: { handle: true } },
              assignedAt: true,
            },
          },
        },
      });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return known.map((slug) => {
        const row = bySlug.get(slug);
        return {
          slug,
          enabled: row?.enabled ?? FEATURE_DEFAULTS[slug],
          hasRow: Boolean(row),
          type: row?.type ?? "RELEASE",
          description: row?.description ?? null,
          assignments:
            row?.assignments.map((a) => ({
              handle: a.user.handle,
              assignedAt: a.assignedAt,
            })) ?? [],
        };
      });
    }),

    setEnabled: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ input }) => {
        await prisma.feature.upsert({
          where: { slug: input.slug },
          create: { slug: input.slug, enabled: input.enabled },
          update: { enabled: input.enabled },
        });
        return { ok: true as const };
      }),

    assign: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          handle: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const target = await prisma.user.findUnique({
          where: { handle: input.handle },
          select: { id: true },
        });
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No user with that handle",
          });
        }
        await prisma.feature.upsert({
          where: { slug: input.slug },
          create: { slug: input.slug, enabled: true },
          update: {},
        });
        await prisma.userFeatures.upsert({
          where: {
            userId_featureSlug: {
              userId: target.id,
              featureSlug: input.slug,
            },
          },
          create: {
            userId: target.id,
            featureSlug: input.slug,
            assignedBy: ctx.user.id,
          },
          update: {},
        });
        return { ok: true as const };
      }),

    unassign: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          handle: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const target = await prisma.user.findUnique({
          where: { handle: input.handle },
          select: { id: true },
        });
        if (!target) return { ok: true as const, deleted: 0 };
        const result = await prisma.userFeatures.deleteMany({
          where: {
            userId: target.id,
            featureSlug: input.slug,
          },
        });
        return { ok: true as const, deleted: result.count };
      }),
  }),

  webhooks: router({
    listAll: adminProcedure.query(async () => {
      const subs = await prisma.webhookSubscription.findMany({
        select: {
          id: true,
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          createdAt: true,
          user: { select: { handle: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return subs;
    }),

    failedDeliveries: adminProcedure.query(async () => {
      const rows = await prisma.task.findMany({
        where: {
          type: "webhookDelivery",
          succeededAt: null,
        },
        select: {
          id: true,
          referenceUid: true,
          attempts: true,
          maxAttempts: true,
          scheduledAt: true,
          lastError: true,
          lastFailedAttemptAt: true,
        },
        orderBy: { lastFailedAttemptAt: "desc" },
        take: 100,
      });
      return rows.filter((r) => r.attempts >= r.maxAttempts);
    }),

    retry: adminProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const updated = await prisma.task.update({
          where: { id: input.taskId },
          data: {
            attempts: 0,
            scheduledAt: new Date(),
            lastError: null,
            lastFailedAttemptAt: null,
          },
          select: { id: true, scheduledAt: true },
        });
        return { ok: true as const, taskId: updated.id };
      }),
  }),

  audit: router({
    byBookingUid: adminProcedure
      .input(z.object({ bookingUid: z.string().min(1) }))
      .query(async ({ input }) => {
        return prisma.bookingAudit.findMany({
          where: { bookingUid: input.bookingUid },
          select: {
            id: true,
            actor: true,
            action: true,
            data: true,
            operationId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        });
      }),
  }),
});
