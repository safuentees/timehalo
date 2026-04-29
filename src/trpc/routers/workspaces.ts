import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { generateApiKey } from "@/lib/api-keys";
import { scheduleEmailSend } from "@/lib/tasks";
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
import { privateProcedure, router } from "@/trpc/trpc";

// Workspace sub-router (B1). Workspaces, memberships, and invitations
// are new primitives — booking / webhook / audit surfaces stay
// user-centric for now, but new collaboration features (co-hosts,
// workspace-scoped tokens, plan gating) can layer on this foundation.
//
// Pattern reference: cal Membership/Team + dub Project/ProjectUsers,
// scope matrix in src/lib/workspaces.ts (single source of truth).

const workspaceMembershipRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

// Helper — fetches the caller's membership in a workspace (by slug)
// and asserts a scope. Throws NOT_FOUND when the workspace doesn't
// exist or the caller isn't a member, FORBIDDEN when the role
// doesn't grant the scope. NOT_FOUND on non-membership is deliberate
// (don't leak workspace existence to non-members).
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
    return memberships.map((m) => ({
      role: m.role,
      assignedAt: m.assignedAt,
      ...m.workspace,
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

  // ─── Workspace lifecycle (B5) ────────────────────────────────────
  //
  // Closes the followups doc's B6 lifecycle four-pack: rename +
  // delete + leave + transfer ownership. Each is a thin procedure
  // so the workspace settings page (B7) can compose them into a
  // dedicated UI panel.

  update: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        // Both fields optional — caller can rename, change slug,
        // or both. Empty input still validates so the procedure is
        // safe to call as a no-op.
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
      try {
        const updated = await prisma.workspace.update({
          where: { id: membership.workspaceId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.newSlug !== undefined ? { slug: input.newSlug } : {}),
          },
          select: { id: true, slug: true, name: true },
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
        // Tighter than workspace.write — only the OWNER can
        // delete a workspace. Cascades wipe bookings, audit, api
        // keys, webhooks, event types, subscription, memberships.
        "workspace.write",
      );
      if (membership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the workspace owner can delete it.",
        });
      }
      // Block deleting the user's last owned workspace — every
      // user must own at least one (auth.register guarantees a
      // Personal workspace; the booking flow assumes it). The
      // user can transfer ownership first, then delete.
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
        // Read scope is enough to leave — the action operates on
        // the caller's own membership. members.write would lock
        // VIEWERs out of leaving.
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
        // The user id of the new owner. Must be a current member
        // of the workspace; OWNER demotes to ADMIN, target
        // promotes to OWNER. Atomic swap inside one transaction.
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
      // Atomic swap. Workspace.ownerId is FK'd — must update it
      // alongside the role swaps so the post-state is consistent.
      // Prisma doesn't support a column-defined unique constraint
      // like "exactly one OWNER per workspace" (that's an app-
      // level invariant), so the transaction is the ordering fence.
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

      // A3 — plan-gated member cap. Pending invitations count toward
      // the cap (same as cal.com): otherwise an OWNER could blast 5
      // invites on a 5-member-cap PRO plan, have all 5 accept, and
      // overflow. Counting both keeps the invariant "members +
      // pending ≤ memberCap" true at every state.
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
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

  // API key CRUD (B2). Tokens are workspace-scoped. The full token
  // returns EXACTLY ONCE at create time; subsequent reads only see
  // the prefix. Minting requires workspace.write — admin-level
  // action even when the resulting key carries narrower scopes.
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
        // Procedure-level gate: members.write (OWNER + ADMIN). The
        // per-scope subset check below is the real guardrail —
        // admins can mint tokens, but only with scopes they hold.
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "members.write",
        );

        // A3 — plan-gated feature. PRO+ only.
        const plan = await planForWorkspace(membership.workspaceId);
        requireFeature(plan, "api-keys");

        // Token can carry at most the scopes the creator's role
        // grants. ADMIN can't mint a key with workspace.write
        // (OWNER-only) even if they pass it in.
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

        // Token returned exactly once. Subsequent reads via .list
        // surface only `prefix` — losing the value forces a rotate.
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
