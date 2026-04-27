import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_AVAILABILITY_ROWS } from "@/lib/schedule";

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

// Bootstrap a default Workspace + OWNER Membership + Mon-Fri 9-5
// availability ranges for a user that next-auth itself creates
// (magic-link first click, GitHub OAuth first sign-in). Mirrors what
// auth.register's transaction does for the credentials path. Without
// the workspace, Unit 1's invariant "every host owns at least one
// Workspace" breaks. Without the availability ranges, the host's
// public page renders zero slots and the onboarding "draw weekly
// hours" step never auto-checks (the form's visual default starts
// isDirty=false so the save button is gated — same trap users hit).
//
// Idempotent on each piece:
// - Skips workspace creation when one already exists.
// - Skips availability seeding when any rows already exist.
// Covers half-failed first attempts and double-fires of events.createUser.
export async function bootstrapUserWorkspace(user: {
  id: string;
  email: string | null;
}): Promise<void> {
  const [existingWorkspace, existingRanges] = await Promise.all([
    prisma.workspace.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    }),
    prisma.availabilityRange.count({ where: { userId: user.id } }),
  ]);

  if (!existingWorkspace) {
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

  if (existingRanges === 0) {
    await prisma.availabilityRange.createMany({
      data: DEFAULT_AVAILABILITY_ROWS.map((row) => ({
        userId: user.id,
        ...row,
      })),
    });
  }
}
