import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { planForUser } from "@/lib/billing";
import { getEnabledFeatures } from "@/lib/feature-flags";
import { handleSchema } from "@/lib/register-schema";
import { scheduleEmailSend } from "@/lib/tasks";
import { timezoneSchema } from "@/lib/timezone";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

export const users = router({
  me: privateProcedure.query(async ({ ctx }) => {
    return await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
      },
    });
  }),

  featureFlags: privateProcedure.query(async ({ ctx }) => {
    return getEnabledFeatures(ctx.user.id);
  }),

  plan: privateProcedure.query(async ({ ctx }) => {
    return { plan: await planForUser(ctx.user.id) };
  }),

  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: {
          id: true,
          name: true,
          handle: true,
          image: true,
          timezone: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  setHandle: privateProcedure
    .input(z.object({ handle: handleSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: ctx.user.id },
            data: { handle: input.handle },
          });
          const workspace = await tx.workspace.findFirst({
            where: { ownerId: ctx.user.id },
            select: { id: true },
            orderBy: { createdAt: "asc" },
          });
          if (workspace) {
            const existing = await tx.eventType.findUnique({
              where: {
                workspaceId_slug: {
                  workspaceId: workspace.id,
                  slug: input.handle,
                },
              },
              select: { id: true },
            });
            if (!existing) {
              const eventType = await tx.eventType.create({
                data: {
                  workspaceId: workspace.id,
                  slug: input.handle,
                  name: input.handle,
                  durationMins: 15,
                },
                select: { id: true },
              });
              await tx.eventTypeHost.upsert({
                where: {
                  eventTypeId_userId: {
                    eventTypeId: eventType.id,
                    userId: ctx.user.id,
                  },
                },
                create: {
                  eventTypeId: eventType.id,
                  userId: ctx.user.id,
                  isFixed: true,
                  priority: 2,
                  weight: 1,
                  recentAssignments: 0,
                },
                update: {},
              });
            }
          }
        });
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That handle is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your handle. Try again.",
          cause,
        });
      }
      return { handle: input.handle };
    }),

  setTimezone: privateProcedure
    .input(z.object({ timezone: timezoneSchema }))
    .mutation(async ({ input, ctx }) => {
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),

  deleteAccount: privateProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { email: true, name: true, handle: true },
    });

    const hostName = user.name ?? user.handle ?? "Officehours user";
    const operationId = crypto.randomUUID();

    await scheduleEmailSend({
      payload: {
        to: user.email,
        template: "account-deleted",
        props: {
          hostName,
          deletedAtIso: new Date().toISOString(),
        },
      },
      referenceUid: `user:${ctx.user.id}:account-deleted:${operationId}`,
    });

    await prisma.user.delete({ where: { id: ctx.user.id } });

    return { ok: true as const };
  }),
});
