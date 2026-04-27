import "server-only";
import { prisma } from "@/lib/prisma";

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
