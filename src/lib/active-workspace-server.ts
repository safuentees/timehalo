import "server-only";
import { prisma } from "@/lib/prisma";

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
