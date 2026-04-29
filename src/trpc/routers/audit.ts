import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasScope, workspaceSlugSchema } from "@/lib/workspaces";
import { privateProcedure, router } from "@/trpc/trpc";

export const audit = router({
  listForWorkspace: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.number().int().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const ws = await prisma.workspace.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          memberships: {
            where: { userId: ctx.user.id },
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
      if (!hasScope(role, "workspace.write")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${role}) cannot view workspace audit history.`,
        });
      }

      const rows = await prisma.bookingAudit.findMany({
        where: {
          workspaceId: ws.id,
          ...(input.cursor !== undefined
            ? { id: { lt: input.cursor } }
            : {}),
        },
        orderBy: { id: "desc" },
        take: input.limit + 1,
        select: {
          id: true,
          bookingUid: true,
          actor: true,
          action: true,
          operationId: true,
          createdAt: true,
        },
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor };
    }),
});
