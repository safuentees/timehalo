import "server-only";
import { prisma } from "@/lib/prisma";

// Resolve the post-sign-in redirect target. Three guarantees:
// 1. Returns same-origin URLs the caller asked for (useful when a
//    deep-link triggers sign-in mid-navigation).
// 2. Rewrites foreign-origin URLs to /bookings (no open redirect).
// 3. Rewrites the auth-landing paths (/, /login, /register) to
//    /bookings — without this, a magic-link initiated from /login
//    carries `callbackUrl=/login` and would loop the user back to
//    the sign-in page.
export function resolveAuthRedirect(input: { url: string; baseUrl: string }): string {
  const { url, baseUrl } = input;
  let target: string;
  if (url.startsWith("/")) {
    target = `${baseUrl}${url}`;
  } else {
    try {
      target = new URL(url).origin === baseUrl ? url : `${baseUrl}/bookings`;
    } catch {
      target = `${baseUrl}/bookings`;
    }
  }
  const path = new URL(target).pathname;
  if (path === "/" || path === "/login" || path === "/register") {
    return `${baseUrl}/bookings`;
  }
  return target;
}

// Bootstrap a default Workspace + OWNER Membership for a user that
// next-auth itself creates (magic-link first click, GitHub OAuth
// first sign-in). Mirrors what auth.register's transaction does for
// the credentials path. Without this, Unit 1's invariant "every host
// owns at least one Workspace" breaks the moment a magic-link user
// clicks through, and bookings.create later fails with a NOT NULL
// violation on workspaceId.
//
// Idempotent: skips if the user already owns a workspace (covers a
// theoretical re-run after a half-failed first attempt).
export async function bootstrapUserWorkspace(user: {
  id: string;
  email: string | null;
}): Promise<void> {
  const existing = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        slug: `personal-${user.id}`,
        name: "Personal",
        ownerId: user.id,
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  });
}
