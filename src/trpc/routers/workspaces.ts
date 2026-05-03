import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { generateApiKey } from "@/lib/api-keys";
import {
  findActiveSubscriptionsForEvent,
  scheduleEmailSend,
  scheduleWebhookDelivery,
} from "@/lib/tasks";
import {
  WORKSPACE_SCOPES,
  INVITATION_EXPIRY_MS,
  hasScope,
  scopesFor,
  workspaceSlugSchema,
  type WorkspaceScope,
} from "@/lib/workspaces";
import { generateInvitationToken } from "@/lib/workspaces-server";
import {
  memberCap,
  planForWorkspace,
  requireFeature,
} from "@/lib/billing";
import { selectHost } from "@/lib/round-robin";
import { findBusyHostIds } from "@/lib/calendar";
import { bumpRecentAssignments } from "@/lib/event-types";
import {
  generateTeamUpcomingSlots,
  resolveTeamEventType,
} from "@/lib/team-event-type";
import {
  createRateLimitMiddleware,
  privateProcedure,
  publicProcedure,
  router,
} from "@/trpc/trpc";

const workspaceMembershipRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

async function requireMembership(
  workspaceSlug: string,
  userId: string,
  scope: WorkspaceScope,
) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      workspace: { slug: workspaceSlug },
    },
    select: {
      id: true,
      role: true,
      workspaceId: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!membership) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workspace not found",
    });
  }
  if (!hasScope(membership.role, scope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Role ${membership.role} can't ${scope}`,
    });
  }
  return membership;
}

export const workspaces = router({
  list: privateProcedure.query(async ({ ctx }) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: ctx.user.id },
      select: {
        role: true,
        assignedAt: true,
        workspace: {
          select: { id: true, slug: true, name: true, createdAt: true },
        },
      },
      orderBy: { assignedAt: "asc" },
    });
    const activeSlug = ctx.activeWorkspaceSlug;
    const cookieMatches = memberships.some(
      (m) => m.workspace.slug === activeSlug,
    );
    const fallbackSlug = memberships[0]?.workspace.slug ?? null;
    const effectiveSlug = cookieMatches ? activeSlug : fallbackSlug;
    return memberships.map((m) => ({
      role: m.role,
      assignedAt: m.assignedAt,
      ...m.workspace,
      isActive: m.workspace.slug === effectiveSlug,
    }));
  }),

  create: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        name: z.string().trim().min(1).max(60),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const ws = await tx.workspace.create({
            data: {
              slug: input.slug,
              name: input.name,
              ownerId: ctx.user.id,
            },
            select: { id: true, slug: true, name: true },
          });
          await tx.membership.create({
            data: {
              workspaceId: ws.id,
              userId: ctx.user.id,
              role: "OWNER",
            },
          });
          return ws;
        });
        return created;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That slug is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create workspace.",
          cause,
        });
      }
    }),

  get: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.read",
      );
      return {
        id: membership.workspace.id,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        callerRole: membership.role,
        callerScopes: scopesFor(membership.role),
      };
    }),

  publicGetBySlug: publicProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input }) => {
      const workspace = await prisma.workspace.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          slug: true,
          name: true,
          memberships: {
            select: {
              role: true,
              assignedAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  handle: true,
                  image: true,
                  timezone: true,
                },
              },
            },
            orderBy: [{ role: "asc" }, { assignedAt: "asc" }],
          },
        },
      });
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND" });

      const members = workspace.memberships
        .filter((m) => m.user.handle !== null)
        .map((m) => ({
          role: m.role,
          id: m.user.id,
          name: m.user.name,
          handle: m.user.handle as string,
          image: m.user.image,
          timezone: m.user.timezone,
        }));

      const eventTypes = await prisma.eventType.findMany({
        where: { workspaceId: workspace.id },
        select: {
          slug: true,
          name: true,
          durationMins: true,
          _count: { select: { hosts: true } },
        },
        orderBy: { name: "asc" },
      });
      const teamEventTypes = eventTypes
        .filter((e) => e._count.hosts > 1)
        .map((e) => ({
          slug: e.slug,
          name: e.name,
          durationMins: e.durationMins,
          hostCount: e._count.hosts,
        }));

      return {
        slug: workspace.slug,
        name: workspace.name,
        members,
        teamEventTypes,
      };
    }),

  publicGetEventType: publicProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeSlug: z.string().min(1).max(60),
      }),
    )
    .query(async ({ input }) => {
      const resolved = await resolveTeamEventType(
        input.slug,
        input.eventTypeSlug,
      );
      if (!resolved) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        workspaceSlug: resolved.workspaceSlug,
        workspaceName: resolved.workspaceName,
        slug: resolved.slug,
        name: resolved.name,
        durationMins: resolved.durationMins,
        hostCount: resolved.hosts.length,
        hostAvatars: resolved.hostUsers.map((u) => u.image),
      };
    }),

  publicGetUpcomingSlotsForEventType: publicProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeSlug: z.string().min(1).max(60),
        days: z.number().int().min(1).max(14).default(7),
      }),
    )
    .query(async ({ input }) => {
      const resolved = await resolveTeamEventType(
        input.slug,
        input.eventTypeSlug,
      );
      if (!resolved) throw new TRPCError({ code: "NOT_FOUND" });
      return generateTeamUpcomingSlots({
        eventType: resolved,
        days: input.days,
      });
    }),

  bookForTeam: publicProcedure
    .use(createRateLimitMiddleware("workspaces.bookForTeam", 10, "1 m"))
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeSlug: z.string().min(1).max(60),
        slotStart: z.string(),
        idempotencyKey: z.string().uuid(),
        visitorName: z.string().min(1).max(120),
        visitorEmail: z.string().email(),
        question: z.string().max(2000).optional(),
        visitorTimezone: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const bookingSelect = {
        id: true,
        publicUid: true,
        slotStart: true,
        slotEnd: true,
      } as const;

      const existingByKey = await prisma.booking.findFirst({
        where: { idempotencyKey: input.idempotencyKey, deleted: false },
        select: {
          ...bookingSelect,
          host: { select: { name: true, handle: true, image: true } },
        },
      });
      if (existingByKey) {
        return {
          publicUid: existingByKey.publicUid,
          slotStart: existingByKey.slotStart,
          slotEnd: existingByKey.slotEnd,
          assignedHost: {
            name: existingByKey.host.name,
            handle: existingByKey.host.handle,
            image: existingByKey.host.image,
          },
        };
      }

      const resolved = await resolveTeamEventType(
        input.slug,
        input.eventTypeSlug,
      );
      if (!resolved) throw new TRPCError({ code: "NOT_FOUND" });

      const slotStart = new Date(input.slotStart);
      if (Number.isNaN(slotStart.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid slot timestamp",
        });
      }
      if (slotStart.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That slot is in the past",
        });
      }

      const slotEnd = new Date(
        slotStart.getTime() + resolved.durationMins * 60_000,
      );

      const [conflictingHosts, calendarBusyHostIds] = await Promise.all([
        prisma.booking.findMany({
          where: {
            eventTypeId: resolved.id,
            slotStart,
            deleted: false,
          },
          select: { hostId: true },
        }),
        findBusyHostIds({
          hostIds: resolved.hosts.map((h) => h.userId),
          slotStart,
          slotEnd,
        }),
      ]);
      const excludeHostIds = new Set<string>([
        ...conflictingHosts.map((b) => b.hostId),
        ...calendarBusyHostIds,
      ]);
      const pick = selectHost({
        hosts: resolved.hosts,
        excludeHostIds,
      });
      if (pick.kind !== "selected") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            pick.kind === "all-conflicted"
              ? "Every host on this event type is already booked at that slot."
              : "No hosts configured for this event type.",
        });
      }
      const pickedHostId = pick.hostId;

      const operationId = crypto.randomUUID();
      const referrer =
        ctx.cookies.get(`oh_ref_${input.slug}`) ?? null;

      const booking = await prisma.$transaction(async (tx) => {
        const existingInTx = await tx.booking.findFirst({
          where: {
            idempotencyKey: input.idempotencyKey,
            deleted: false,
          },
          select: bookingSelect,
        });
        if (existingInTx) return existingInTx;

        const slotCollision = await tx.booking.findFirst({
          where: { hostId: pickedHostId, slotStart, deleted: false },
          select: { id: true },
        });
        if (slotCollision) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Someone just grabbed that slot. Pick another.",
          });
        }

        const created = await tx.booking.create({
          data: {
            hostId: pickedHostId,
            workspaceId: resolved.workspaceId,
            eventTypeId: resolved.id,
            visitorName: input.visitorName,
            visitorEmail: input.visitorEmail,
            question: input.question,
            slotStart,
            slotEnd,
            idempotencyKey: input.idempotencyKey,
            referrer,
            visitorTimezone: input.visitorTimezone ?? null,
          },
          select: bookingSelect,
        });

        await tx.bookingAudit.create({
          data: {
            bookingUid: created.publicUid,
            workspaceId: resolved.workspaceId,
            actor: "VISITOR",
            action: "CREATED",
            data: {
              hostId: pickedHostId,
              eventTypeId: resolved.id,
              workspaceSlug: input.slug,
              eventTypeSlug: input.eventTypeSlug,
              visitorName: input.visitorName,
              visitorEmail: input.visitorEmail,
              question: input.question ?? null,
              slotStart: created.slotStart.toISOString(),
              slotEnd: created.slotEnd.toISOString(),
              idempotencyKey: input.idempotencyKey,
              referrer,
            },
            operationId,
          },
        });

        return created;
      });

      try {
        await bumpRecentAssignments({
          eventTypeId: resolved.id,
          userId: pickedHostId,
        });
      } catch (err) {
        console.error(
          "[workspaces.bookForTeam] bumpRecentAssignments",
          err,
        );
      }

      const subscriptions = await findActiveSubscriptionsForEvent(
        resolved.workspaceId,
        "booking.created",
      );
      const pickedHost = await prisma.user.findUnique({
        where: { id: pickedHostId },
        select: {
          name: true,
          handle: true,
          image: true,
          email: true,
        },
      });
      for (const sub of subscriptions) {
        await scheduleWebhookDelivery({
          payload: {
            webhookSubscriptionId: sub.id,
            event: "booking.created",
            body: {
              event: "booking.created",
              operationId,
              booking: {
                publicUid: booking.publicUid,
                slotStart: booking.slotStart.toISOString(),
                slotEnd: booking.slotEnd.toISOString(),
                visitorName: input.visitorName,
                visitorEmail: input.visitorEmail,
                question: input.question ?? null,
              },
              host: {
                handle: pickedHost?.handle ?? null,
                id: pickedHostId,
              },
              eventType: {
                workspaceSlug: input.slug,
                slug: input.eventTypeSlug,
              },
              createdAt: new Date().toISOString(),
            },
          },
          referenceUid: `${booking.publicUid}:booking.created:${sub.id}`,
        });
      }

      const appUrl =
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const confirmationUrl = `${appUrl}/w/${input.slug}/${input.eventTypeSlug}/booked/${booking.publicUid}`;
      const hostName =
        pickedHost?.name ?? pickedHost?.handle ?? "your host";
      await scheduleEmailSend({
        payload: {
          to: input.visitorEmail,
          template: "booking-created",
          props: {
            hostName,
            visitorName: input.visitorName,
            slotStartIso: booking.slotStart.toISOString(),
            question: input.question ?? null,
            confirmationUrl,
          },
        },
        referenceUid: `${booking.publicUid}:email:booking-created:visitor`,
      });

      return {
        publicUid: booking.publicUid,
        slotStart: booking.slotStart,
        slotEnd: booking.slotEnd,
        assignedHost: {
          name: pickedHost?.name ?? null,
          handle: pickedHost?.handle ?? null,
          image: pickedHost?.image ?? null,
        },
      };
    }),

  update: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        name: z.string().trim().min(1).max(60).optional(),
        newSlug: workspaceSlugSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.write",
      );
      const slugChanging =
        input.newSlug !== undefined && input.newSlug !== input.slug;
      try {
        const updated = await prisma.$transaction(async (tx) => {
          if (slugChanging && input.newSlug) {
            await tx.workspaceSlugHistory.deleteMany({
              where: { oldSlug: input.newSlug },
            });
            await tx.workspaceSlugHistory.upsert({
              where: { oldSlug: input.slug },
              create: {
                workspaceId: membership.workspaceId,
                oldSlug: input.slug,
              },
              update: {
                workspaceId: membership.workspaceId,
                replacedAt: new Date(),
              },
            });
          }
          return tx.workspace.update({
            where: { id: membership.workspaceId },
            data: {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.newSlug !== undefined
                ? { slug: input.newSlug }
                : {}),
            },
            select: { id: true, slug: true, name: true },
          });
        });
        return updated;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That slug is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not update workspace.",
          cause,
        });
      }
    }),

  delete: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.write",
      );
      if (membership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the workspace owner can delete it.",
        });
      }
      const ownedCount = await prisma.workspace.count({
        where: { ownerId: ctx.user.id },
      });
      if (ownedCount <= 1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Can't delete your last workspace. Create another or transfer ownership first.",
        });
      }
      await prisma.workspace.delete({
        where: { id: membership.workspaceId },
      });
      return { ok: true as const };
    }),

  leave: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.read",
      );
      if (membership.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Owner can't leave. Transfer ownership first or delete the workspace.",
        });
      }
      await prisma.membership.delete({ where: { id: membership.id } });
      return { ok: true as const };
    }),

  transferOwnership: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        newOwnerUserId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.write",
      );
      if (callerMembership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the current owner can transfer ownership.",
        });
      }
      if (input.newOwnerUserId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Already the owner.",
        });
      }
      const target = await prisma.membership.findFirst({
        where: {
          workspaceId: callerMembership.workspaceId,
          userId: input.newOwnerUserId,
        },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User is not a member of this workspace.",
        });
      }
      await prisma.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: callerMembership.id },
          data: { role: "ADMIN", assignedBy: input.newOwnerUserId },
        });
        await tx.membership.update({
          where: { id: target.id },
          data: { role: "OWNER", assignedBy: ctx.user.id },
        });
        await tx.workspace.update({
          where: { id: callerMembership.workspaceId },
          data: { ownerId: input.newOwnerUserId },
        });
      });
      return { ok: true as const };
    }),

  listMembers: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.read",
      );
      return prisma.membership.findMany({
        where: { workspaceId: membership.workspaceId },
        select: {
          id: true,
          role: true,
          assignedAt: true,
          user: {
            select: { id: true, handle: true, name: true, email: true },
          },
        },
        orderBy: { assignedAt: "asc" },
      });
    }),

  setMemberRole: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        userId: z.string().min(1),
        role: workspaceMembershipRoleSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      const target = await prisma.membership.findFirst({
        where: {
          workspaceId: callerMembership.workspaceId,
          userId: input.userId,
        },
        select: { id: true, role: true, userId: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User is not a member of this workspace",
        });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner role can't be reassigned here",
        });
      }
      if (
        input.role === "ADMIN" &&
        callerMembership.role !== "OWNER"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can grant ADMIN",
        });
      }
      await prisma.membership.update({
        where: { id: target.id },
        data: { role: input.role, assignedBy: ctx.user.id },
      });
      return { ok: true as const };
    }),

  removeMember: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        input.userId === ctx.user.id ? "workspace.read" : "members.write",
      );
      const target = await prisma.membership.findFirst({
        where: {
          workspaceId: callerMembership.workspaceId,
          userId: input.userId,
        },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User is not a member of this workspace",
        });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner can't be removed",
        });
      }
      await prisma.membership.delete({ where: { id: target.id } });
      return { ok: true as const };
    }),

  invite: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        email: z.string().trim().email().toLowerCase(),
        role: workspaceMembershipRoleSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      if (input.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner can't be granted via invite",
        });
      }
      if (input.role === "ADMIN" && callerMembership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can invite ADMINs",
        });
      }

      const plan = await planForWorkspace(callerMembership.workspaceId);
      const cap = memberCap(plan);
      const [memberCount, pendingCount] = await Promise.all([
        prisma.membership.count({
          where: { workspaceId: callerMembership.workspaceId },
        }),
        prisma.invitation.count({
          where: {
            workspaceId: callerMembership.workspaceId,
            acceptedAt: null,
          },
        }),
      ]);
      if (memberCount + pendingCount + 1 > cap) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Member cap reached for ${plan} plan (${cap}). Upgrade to add more.`,
        });
      }

      const token = await generateInvitationToken();
      const invitation = await prisma.invitation.create({
        data: {
          workspaceId: callerMembership.workspaceId,
          email: input.email,
          role: input.role,
          token,
          invitedBy: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });

      const inviter = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true, handle: true },
      });
      const inviterName =
        inviter?.name ?? inviter?.handle ?? "An Officehours user";
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const acceptUrl = `${appUrl}/invitations/${token}`;
      await scheduleEmailSend({
        payload: {
          to: input.email,
          template: "workspace-invite",
          props: {
            workspaceName: callerMembership.workspace.name,
            inviterName,
            role: input.role,
            acceptUrl,
          },
        },
        referenceUid: `invitation:${invitation.id}:email`,
      });

      return invitation;
    }),

  listInvitations: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.read",
      );
      return prisma.invitation.findMany({
        where: { workspaceId: callerMembership.workspaceId },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  inviteMany: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        invites: z
          .array(
            z.object({
              email: z.string().trim().email().toLowerCase(),
              role: workspaceMembershipRoleSchema,
            }),
          )
          .min(1, "At least one invite")
          .max(50, "At most 50 invites per call"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );

      for (const inv of input.invites) {
        if (inv.role === "OWNER") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Owner can't be granted via invite",
          });
        }
        if (
          inv.role === "ADMIN" &&
          callerMembership.role !== "OWNER"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the owner can invite ADMINs",
          });
        }
      }

      const plan = await planForWorkspace(callerMembership.workspaceId);
      const cap = memberCap(plan);
      const [memberCount, pendingCount] = await Promise.all([
        prisma.membership.count({
          where: { workspaceId: callerMembership.workspaceId },
        }),
        prisma.invitation.count({
          where: {
            workspaceId: callerMembership.workspaceId,
            acceptedAt: null,
          },
        }),
      ]);
      if (
        memberCount + pendingCount + input.invites.length >
        cap
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Member cap would be exceeded for ${plan} plan (${cap}). Upgrade or reduce the batch.`,
        });
      }

      const tokens = await Promise.all(
        input.invites.map(() => generateInvitationToken()),
      );
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
      const inviter = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true, handle: true },
      });
      const inviterName =
        inviter?.name ?? inviter?.handle ?? "An Officehours user";
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

      const created = await prisma.$transaction(
        input.invites.map((inv, i) =>
          prisma.invitation.create({
            data: {
              workspaceId: callerMembership.workspaceId,
              email: inv.email,
              role: inv.role,
              token: tokens[i],
              invitedBy: ctx.user.id,
              expiresAt,
            },
            select: {
              id: true,
              email: true,
              role: true,
              expiresAt: true,
            },
          }),
        ),
      );

      await Promise.all(
        created.map((inv, i) =>
          scheduleEmailSend({
            payload: {
              to: inv.email,
              template: "workspace-invite",
              props: {
                workspaceName: callerMembership.workspace.name,
                inviterName,
                role: inv.role,
                acceptUrl: `${appUrl}/invitations/${tokens[i]}`,
              },
            },
            referenceUid: `invitation:${inv.id}:email`,
          }),
        ),
      );

      return created;
    }),

  resendInvitation: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        invitationId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      const existing = await prisma.invitation.findFirst({
        where: {
          id: input.invitationId,
          workspaceId: callerMembership.workspaceId,
          acceptedAt: null,
        },
        select: { id: true, email: true, role: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found or already accepted",
        });
      }
      const token = await generateInvitationToken();
      const updated = await prisma.invitation.update({
        where: { id: existing.id },
        data: {
          token,
          expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });

      const inviter = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true, handle: true },
      });
      const inviterName =
        inviter?.name ?? inviter?.handle ?? "An Officehours user";
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
      const acceptUrl = `${appUrl}/invitations/${token}`;
      await scheduleEmailSend({
        payload: {
          to: existing.email,
          template: "workspace-invite",
          props: {
            workspaceName: callerMembership.workspace.name,
            inviterName,
            role: existing.role,
            acceptUrl,
          },
        },
        referenceUid: `invitation:${existing.id}:resend:${Date.now()}`,
      });

      return updated;
    }),

  updateInvitationRole: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        invitationId: z.string().min(1),
        role: workspaceMembershipRoleSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      if (input.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner can't be granted via invite",
        });
      }
      if (input.role === "ADMIN" && callerMembership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can grant ADMIN",
        });
      }
      const result = await prisma.invitation.updateMany({
        where: {
          id: input.invitationId,
          workspaceId: callerMembership.workspaceId,
          acceptedAt: null,
        },
        data: { role: input.role },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found or already accepted",
        });
      }
      return { ok: true as const };
    }),

  revokeInvitation: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        invitationId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      const result = await prisma.invitation.deleteMany({
        where: {
          id: input.invitationId,
          workspaceId: callerMembership.workspaceId,
          acceptedAt: null,
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found or already accepted",
        });
      }
      return { ok: true as const };
    }),

  apiKeys: router({
    list: privateProcedure
      .input(z.object({ slug: workspaceSlugSchema }))
      .query(async ({ input, ctx }) => {
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "workspace.read",
        );
        return prisma.apiKey.findMany({
          where: { workspaceId: membership.workspaceId },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }),

    create: privateProcedure
      .input(
        z.object({
          slug: workspaceSlugSchema,
          name: z.string().trim().min(1).max(60),
          scopes: z
            .array(z.enum(WORKSPACE_SCOPES))
            .min(1, "At least one scope")
            .max(WORKSPACE_SCOPES.length),
          expiresAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "members.write",
        );

        const plan = await planForWorkspace(membership.workspaceId);
        requireFeature(plan, "api-keys");

        const callerScopes = new Set(scopesFor(membership.role));
        for (const s of input.scopes) {
          if (!callerScopes.has(s)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Token scope ${s} exceeds creator role`,
            });
          }
        }

        const key = generateApiKey();
        const created = await prisma.apiKey.create({
          data: {
            workspaceId: membership.workspaceId,
            name: input.name,
            prefix: key.prefix,
            tokenHash: key.hash,
            scopes: input.scopes.join(","),
            createdById: ctx.user.id,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            createdAt: true,
            expiresAt: true,
          },
        });

        return { ...created, token: key.token };
      }),

    revoke: privateProcedure
      .input(
        z.object({
          slug: workspaceSlugSchema,
          keyId: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "workspace.write",
        );
        const result = await prisma.apiKey.updateMany({
          where: {
            id: input.keyId,
            workspaceId: membership.workspaceId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        if (result.count === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API key not found or already revoked",
          });
        }
        return { ok: true as const };
      }),
  }),
});
