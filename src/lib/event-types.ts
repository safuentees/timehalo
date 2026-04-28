import "server-only";
import { prisma } from "@/lib/prisma";
import type { Host as RoundRobinHost } from "@/lib/round-robin";

export type ResolvedEventType = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  durationMins: number;
  hosts: ReadonlyArray<RoundRobinHost & { isFixed: boolean; userId: string }>;
};

export async function resolveEventTypeForHandle(
  handle: string,
): Promise<ResolvedEventType | null> {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      ownedWorkspaces: {
        select: { id: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user || user.ownedWorkspaces.length === 0) return null;

  const workspaceId = user.ownedWorkspaces[0].id;
  const eventType = await prisma.eventType.findUnique({
    where: {
      workspaceId_slug: { workspaceId, slug: handle },
    },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      name: true,
      durationMins: true,
      hosts: {
        select: {
          userId: true,
          isFixed: true,
          priority: true,
          weight: true,
          recentAssignments: true,
        },
      },
    },
  });
  if (!eventType) return null;

  return {
    id: eventType.id,
    workspaceId: eventType.workspaceId,
    slug: eventType.slug,
    name: eventType.name,
    durationMins: eventType.durationMins,
    hosts: eventType.hosts.map((h) => ({
      id: h.userId,
      userId: h.userId,
      isFixed: h.isFixed,
      priority: h.priority,
      weight: h.weight,
      recentAssignments: h.recentAssignments,
    })),
  };
}

export async function bumpRecentAssignments(opts: {
  eventTypeId: string;
  userId: string;
}): Promise<void> {
  await prisma.eventTypeHost.updateMany({
    where: { eventTypeId: opts.eventTypeId, userId: opts.userId },
    data: { recentAssignments: { increment: 1 } },
  });
}
