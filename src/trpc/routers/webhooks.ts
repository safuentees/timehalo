import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { privateProcedure, router } from "@/trpc/trpc";

const webhookCreateSchema = z.object({
  subscriberUrl: z.string().url("Must be a valid https URL"),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pick at least one event"),
});

export const webhooks = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.webhookSubscription.findMany({
      where: { userId: ctx.user.id },
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
      const { randomBytes } = await import("node:crypto");
      const secret = randomBytes(32).toString("hex");

      const created = await prisma.webhookSubscription.create({
        data: {
          userId: ctx.user.id,
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
    .input(z.object({ publicUid: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.webhookSubscription.deleteMany({
        where: { publicUid: input.publicUid, userId: ctx.user.id },
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
