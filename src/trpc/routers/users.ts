import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { planForUser } from "@/lib/billing";
import { isAdminHandle } from "@/lib/admin";
import { getEnabledFeatures } from "@/lib/feature-flags";
import {
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "@/lib/onboarding";
import { deriveHostDisplayLabel } from "@/lib/handle";
import { handleSchema } from "@/lib/register-schema";
import { scheduleEmailSend } from "@/lib/tasks";
import { timezoneSchema } from "@/lib/timezone";
import {
  durationsListSchema,
  parseDurationsList,
  resolveDurationChoices,
} from "@/lib/durations";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

function parseManualSteps(raw: string): OnboardingStepId[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is OnboardingStepId =>
      (ONBOARDING_STEP_IDS as readonly string[]).includes(v),
    );
  } catch {
    return [];
  }
}

export const users = router({
  me: privateProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
        name: true,
        image: true,
        bio: true,
        onboardingDismissed: true,
        onboardingManualSteps: true,
      },
    });
    const eventType = user.handle
      ? await prisma.eventType.findFirst({
          where: { slug: user.handle, hosts: { some: { userId: user.id } } },
          select: { id: true, durationMins: true, durationMinsList: true },
        })
      : null;
    return {
      ...user,
      isAdmin: isAdminHandle(user.handle),
      onboardingManualSteps: parseManualSteps(user.onboardingManualSteps),
      durations: {
        defaultMinutes: eventType?.durationMins ?? 15,
        list: eventType ? parseDurationsList(eventType.durationMinsList) : [],
      },
    };
  }),

  setOnboardingState: privateProcedure
    .input(
      z
        .object({
          dismissed: z.boolean().optional(),
          manualSteps: z.array(z.enum(ONBOARDING_STEP_IDS)).optional(),
        })
        .refine(
          (v) => v.dismissed !== undefined || v.manualSteps !== undefined,
          { message: "At least one of dismissed / manualSteps required" },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      const data: {
        onboardingDismissed?: boolean;
        onboardingManualSteps?: string;
      } = {};
      if (input.dismissed !== undefined)
        data.onboardingDismissed = input.dismissed;
      if (input.manualSteps !== undefined) {
        const unique = Array.from(new Set(input.manualSteps)).sort();
        data.onboardingManualSteps = JSON.stringify(unique);
      }
      await prisma.user.update({ where: { id: ctx.user.id }, data });
      return { ok: true as const };
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
          email: true,
          handle: true,
          image: true,
          timezone: true,
          bio: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const eventType = await prisma.eventType.findFirst({
        where: { slug: input.handle, hosts: { some: { userId: user.id } } },
        select: { durationMins: true, durationMinsList: true },
      });
      const durationChoices = eventType
        ? resolveDurationChoices(eventType)
        : [{ minutes: 15, title: null, description: null }];
      const defaultDurationMinutes = eventType?.durationMins ?? 15;
      const displayLabel = deriveHostDisplayLabel(user);
      const { email: _email, ...publicUser } = user;
      return {
        ...publicUser,
        displayLabel,
        durationChoices,
        defaultDurationMinutes,
      };
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
                  durationMinsList: JSON.stringify([15]),
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

  setBio: privateProcedure
    .input(
      z.object({
        bio: z
          .string()
          .max(500, "500 characters max")
          .nullable()
          .transform((v) => {
            if (v === null) return null;
            const trimmed = v.trim();
            return trimmed.length === 0 ? null : trimmed;
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { bio: input.bio },
      });
      return { bio: input.bio };
    }),

  setDurationsList: privateProcedure
    .input(z.object({ list: durationsListSchema }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { handle: true },
      });
      if (!user.handle) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set your public handle before configuring durations.",
        });
      }
      const eventType = await prisma.eventType.findFirst({
        where: {
          slug: user.handle,
          hosts: { some: { userId: ctx.user.id } },
        },
        select: { id: true },
      });
      if (!eventType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No event type found for your handle.",
        });
      }
      await prisma.eventType.update({
        where: { id: eventType.id },
        data: { durationMinsList: JSON.stringify(input.list) },
      });
      return { list: input.list };
    }),

  exportData: privateProcedure.query(async ({ ctx }) => {
    const [
      user,
      bookings,
      availabilityRanges,
      calendarCredentials,
      ownedWorkspaces,
      memberships,
      webhookSubscriptions,
      userFeatures,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          handle: true,
          image: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.booking.findMany({
        where: { hostId: ctx.user.id },
        select: {
          id: true,
          publicUid: true,
          slotStart: true,
          slotEnd: true,
          visitorEmail: true,
          visitorName: true,
          visitorTimezone: true,
          question: true,
          referrer: true,
          rescheduledFromUid: true,
          deleted: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.availabilityRange.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.calendarCredential.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          provider: true,
          externalAccountId: true,
          externalAccountEmail: true,
          accessTokenExpiresAt: true,
          scope: true,
          createdAt: true,
        },
      }),
      prisma.workspace.findMany({
        where: { ownerId: ctx.user.id },
        select: {
          id: true,
          slug: true,
          name: true,
          createdAt: true,
        },
      }),
      prisma.membership.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          role: true,
          workspaceId: true,
          assignedAt: true,
        },
      }),
      prisma.webhookSubscription.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          createdAt: true,
        },
      }),
      prisma.userFeatures.findMany({
        where: { userId: ctx.user.id },
        select: {
          featureSlug: true,
          assignedAt: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      user,
      bookings,
      availabilityRanges,
      calendarCredentials,
      ownedWorkspaces,
      memberships,
      webhookSubscriptions,
      userFeatures,
    };
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

    await prisma.$transaction(async (tx) => {
      await tx.workspace.deleteMany({ where: { ownerId: ctx.user.id } });
      await tx.membership.deleteMany({ where: { userId: ctx.user.id } });
      await tx.user.delete({ where: { id: ctx.user.id } });
    });

    return { ok: true as const };
  }),
});
