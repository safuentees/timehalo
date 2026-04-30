import "server-only";
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
// Returns `null` when the user has no membership at all — defensive
// against stale-session edge cases (e.g. the user's row was deleted
// after their JWT was minted, or the seed wiped + reseeded the user
// while a cookie from the prior round was still valid). The ORIGINAL
// implementation threw INTERNAL_SERVER_ERROR here; that turned a
// hydration-cache miss (prefetch swallows errors → dehydrated state
// excludes failed queries → client useQuery sees undefined → empty
// state) into a confusing "no skeleton ever finishes" UX instead of
// the expected "you have no bookings yet" empty card. Callers that
// receive `null` should render the empty list path; the throw never
// added information the caller could act on.

export async function resolveActiveWorkspaceId(
  userId: string,
  slug: string | null,
): Promise<string | null> {
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
  return fallback?.workspaceId ?? null;
}
