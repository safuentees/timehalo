import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hasScope,
  workspaceSlugSchema,
  type WorkspaceScope,
} from "@/lib/workspaces";
import { privateProcedure, router } from "@/trpc/trpc";

// B4 — Workspace event-type management surface. Closes the
// 5b8914e WHAT'S DEFERRED:
//
//   "NOT in this commit — workspace OWNERs can populate
//   EventTypeHost rows directly via Prisma Studio for now. The
//   /workspaces/<slug>/event-types surface is a future commit;
//   ships its own scope."
//
// Two layers:
//   • EventType CRUD (list, create, update, delete) for the
//     workspace's bookable resources.
//   • EventTypeHost pool management (add, remove, update isFixed/
//     priority/weight) so OWNER/ADMIN can configure the round-
//     robin pool that bookings.create consumes.
//
// Read scope: workspace.read (any member). Write scope:
// workspace.write (OWNER + ADMIN only — same as billing surfaces).

// Slug rules — same alphabet as Workspace.slug + User.handle so
// /h/<handle>-style URLs and workspace-scoped URLs share the same
// vocabulary. 1-30 chars; the @@unique on (workspaceId, slug)
// catches duplicates per workspace.
const eventTypeSlugSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(30, "30 characters max")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/,
    "Lowercase letters, digits, hyphens",
  );

const eventTypeNameSchema = z.string().trim().min(1, "Required").max(60);
const durationMinsSchema = z.number().int().min(5).max(480);

const isFixedSchema = z.boolean();
// Cal.com convention: 0–4, higher wins. Stored as int; default 2.
const prioritySchema = z.number().int().min(0).max(4);
// Positive weight; the algorithm normalizes recentAssignments / weight.
const weightSchema = z.number().int().min(1).max(100);

async function requireWorkspaceScope(opts: {
  slug: string;
  userId: string;
  scope: WorkspaceScope;
}): Promise<{ workspaceId: string; role: string }> {
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
  return { workspaceId: ws.id, role };
}

// Asserts the EventType belongs to the slug-scoped workspace and
// returns its id. Threads through every host-pool mutation so a
// caller can't accidentally (or maliciously) target a row in
// another workspace via a known eventTypeId.
async function resolveEventTypeInWorkspace(opts: {
  workspaceId: string;
  eventTypeId: string;
}): Promise<{ id: string }> {
  const et = await prisma.eventType.findFirst({
    where: { id: opts.eventTypeId, workspaceId: opts.workspaceId },
    select: { id: true },
  });
  if (!et) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Event type not found",
    });
  }
  return et;
}

export const eventTypes = router({
  // ─── Event-type CRUD ─────────────────────────────────────────────

  list: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.read",
      });
      return prisma.eventType.findMany({
        where: { workspaceId },
        select: {
          id: true,
          slug: true,
          name: true,
          durationMins: true,
          createdAt: true,
          _count: { select: { hosts: true, bookings: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeSlug: eventTypeSlugSchema,
        name: eventTypeNameSchema,
        durationMins: durationMinsSchema.default(15),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      try {
        const created = await prisma.eventType.create({
          data: {
            workspaceId,
            slug: input.eventTypeSlug,
            name: input.name,
            durationMins: input.durationMins,
          },
          select: { id: true, slug: true, name: true, durationMins: true },
        });
        return created;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug already used in this workspace.",
            cause,
          });
        }
        throw cause;
      }
    }),

  update: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
        name: eventTypeNameSchema.optional(),
        durationMins: durationMinsSchema.optional(),
        eventTypeSlug: eventTypeSlugSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      try {
        const updated = await prisma.eventType.update({
          where: { id: input.eventTypeId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.durationMins !== undefined
              ? { durationMins: input.durationMins }
              : {}),
            ...(input.eventTypeSlug !== undefined
              ? { slug: input.eventTypeSlug }
              : {}),
          },
          select: { id: true, slug: true, name: true, durationMins: true },
        });
        return updated;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Slug already used in this workspace.",
            cause,
          });
        }
        throw cause;
      }
    }),

  delete: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      // Booking.eventTypeId is `onDelete: SetNull` — historical
      // bookings keep their archive value when the event type is
      // deleted (they live on with eventTypeId=null). Hosts cascade
      // (onDelete: Cascade on EventTypeHost.eventTypeId).
      await prisma.eventType.delete({ where: { id: input.eventTypeId } });
      return { ok: true as const };
    }),

  // ─── EventTypeHost pool management ───────────────────────────────

  listHosts: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.read",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      return prisma.eventTypeHost.findMany({
        where: { eventTypeId: input.eventTypeId },
        select: {
          id: true,
          isFixed: true,
          priority: true,
          weight: true,
          recentAssignments: true,
          createdAt: true,
          user: {
            select: { id: true, handle: true, name: true, email: true },
          },
        },
        orderBy: [{ isFixed: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
      });
    }),

  addHost: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
        userId: z.string().min(1),
        isFixed: isFixedSchema.default(false),
        priority: prioritySchema.default(2),
        weight: weightSchema.default(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      // Adding host: target user must be a workspace member. Reject
      // outsiders so the round-robin pool can't include strangers.
      const member = await prisma.membership.findFirst({
        where: { workspaceId, userId: input.userId },
        select: { id: true },
      });
      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not a member of this workspace.",
        });
      }
      try {
        const created = await prisma.eventTypeHost.create({
          data: {
            eventTypeId: input.eventTypeId,
            userId: input.userId,
            isFixed: input.isFixed,
            priority: input.priority,
            weight: input.weight,
          },
          select: { id: true, isFixed: true, priority: true, weight: true },
        });
        return created;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User is already a host for this event type.",
            cause,
          });
        }
        throw cause;
      }
    }),

  updateHost: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
        userId: z.string().min(1),
        isFixed: isFixedSchema.optional(),
        priority: prioritySchema.optional(),
        weight: weightSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      const result = await prisma.eventTypeHost.updateMany({
        where: {
          eventTypeId: input.eventTypeId,
          userId: input.userId,
        },
        data: {
          ...(input.isFixed !== undefined ? { isFixed: input.isFixed } : {}),
          ...(input.priority !== undefined
            ? { priority: input.priority }
            : {}),
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Host pool entry not found.",
        });
      }
      return { ok: true as const };
    }),

  removeHost: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        eventTypeId: z.string().min(1),
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { workspaceId } = await requireWorkspaceScope({
        slug: input.slug,
        userId: ctx.user.id,
        scope: "workspace.write",
      });
      await resolveEventTypeInWorkspace({
        workspaceId,
        eventTypeId: input.eventTypeId,
      });
      const result = await prisma.eventTypeHost.deleteMany({
        where: {
          eventTypeId: input.eventTypeId,
          userId: input.userId,
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Host pool entry not found.",
        });
      }
      return { ok: true as const };
    }),
});
