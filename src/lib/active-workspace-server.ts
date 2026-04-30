import "server-only";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";

// B.PT16 — server-side resolver: cookie-derived slug → workspace id.
//
// Bookings + the SSE bus need a `workspaceId` to scope reads / event
// channels. The cookie carries a slug (B.PT6); the procedures want
// the id. Resolving here in one place keeps the fall-back invariant
// in one source of truth: when the cookie is unset OR points at a
// workspace the user is no longer a member of, fall back to the
// oldest membership. That mirrors `workspaces.list`'s `effectiveSlug`
// behaviour so the dashboard switcher and the procedures it scopes
// always agree on what "active" means.
//
// Throws INTERNAL_SERVER_ERROR if the user has no membership at all
// — schema + auth.register guarantee otherwise; throwing turns a
// missed migration into a noisy alert instead of a silent NULL.

export async function resolveActiveWorkspaceId(
  userId: string,
  slug: string | null,
): Promise<string> {
  if (slug) {
    const membership = await prisma.membership.findFirst({
      where: { userId, workspace: { slug } },
      select: { workspaceId: true },
    });
    if (membership) return membership.workspaceId;
  }
  const fallback = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { assignedAt: "asc" },
    select: { workspaceId: true },
  });
  if (!fallback) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "User has no workspace",
    });
  }
  return fallback.workspaceId;
}
