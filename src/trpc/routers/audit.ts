import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasScope, workspaceSlugSchema } from "@/lib/workspaces";
import { privateProcedure, router } from "@/trpc/trpc";

// Audit sub-router (B1). One procedure: workspace-scoped audit
// listing. Designed for the workspace OWNER/ADMIN view that wasn't
// reachable while BookingAudit hung off User.id only — now that
// every audit row carries `workspaceId`, the query is a single
// scan against the @@index([workspaceId, createdAt]).
//
// Scope: OWNER + ADMIN get full visibility. MEMBER and VIEWER do
// not — audit history is operational chrome, not a member feature.
// `members.read` would be too permissive (it's about "who's in
// here"); we use `workspace.write` since audit is OWNER/ADMIN
// territory in cal.com / dub-style team rooms too.

export const audit = router({
  listForWorkspace: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        limit: z.number().int().min(1).max(200).default(50),
        // Cursor = last seen audit `id`, descending order. Caller
        // passes the smallest id from the previous page to get the
        // next page; first page omits.
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
      // Audit visibility = workspace.write scope. Workspace.write
      // belongs to OWNER + ADMIN; MEMBER and VIEWER are blocked.
      // Reuses the existing matrix in src/lib/workspaces.ts so
      // role updates flow through one source of truth.
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

      // Trailing row is the cursor pointer for the NEXT page; not
      // returned in items. Standard limit+1 keyset pagination.
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor };
    }),
});
