import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

export const invitations = router({
  preview: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
        select: {
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          workspace: {
            select: { slug: true, name: true },
          },
        },
      });
      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }
      const expired = inv.expiresAt.getTime() < Date.now();
      return { ...inv, expired };
    }),

  accept: privateProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
        select: {
          id: true,
          workspaceId: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          email: true,
        },
      });
      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }
      if (inv.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation already accepted",
        });
      }
      if (inv.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation expired",
        });
      }

      try {
        await prisma.$transaction([
          prisma.membership.create({
            data: {
              workspaceId: inv.workspaceId,
              userId: ctx.user.id,
              role: inv.role,
              assignedBy: null,
            },
          }),
          prisma.invitation.update({
            where: { id: inv.id },
            data: { acceptedAt: new Date() },
          }),
        ]);
      } catch (cause) {
        if (isUniqueConstraintError(cause)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You're already a member of this workspace",
            cause,
          });
        }
        throw cause;
      }
      return { ok: true as const, workspaceId: inv.workspaceId };
    }),
});
