import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { generateApiKey } from "@/lib/api-keys";
import { scheduleEmailSend } from "@/lib/tasks";
import {
  WORKSPACE_SCOPES,
  WORKSPACE_SLUG_REGEX,
  INVITATION_EXPIRY_MS,
  hasScope,
  scopesFor,
  type WorkspaceScope,
} from "@/lib/workspaces";
import { generateInvitationToken } from "@/lib/workspaces-server";
import { privateProcedure, router } from "@/trpc/trpc";

// Workspace sub-router (B1). Workspaces, memberships, and invitations
// are new primitives — booking / webhook / audit surfaces stay
// user-centric for now, but new collaboration features (co-hosts,
// workspace-scoped tokens, plan gating) can layer on this foundation.
//
// Pattern reference: cal Membership/Team + dub Project/ProjectUsers,
// scope matrix in src/lib/workspaces.ts (single source of truth).

const workspaceSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(WORKSPACE_SLUG_REGEX, {
    message: "Lowercase letters, digits, hyphens. 3–30 chars.",
  });

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
