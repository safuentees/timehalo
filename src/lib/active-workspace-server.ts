import "server-only";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";

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
