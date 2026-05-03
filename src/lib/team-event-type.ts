import "server-only";
import { prisma } from "@/lib/prisma";
import { generateUpcomingSlots } from "@/lib/schedule";
import {
  fetchHostBusyTimes,
  subtractBusyTimes,
  type Slot as ScheduleSlot,
} from "@/lib/calendar";
import type { Host as RoundRobinHost } from "@/lib/round-robin";

const SLOT_MINUTES = 15;

export type ResolvedTeamEventType = {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  slug: string;
  name: string;
  durationMins: number;
  hosts: ReadonlyArray<
    RoundRobinHost & { isFixed: boolean; userId: string }
  >;
  hostUsers: ReadonlyArray<{
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
    timezone: string;
  }>;
};

export async function resolveTeamEventType(
  workspaceSlug: string,
  eventTypeSlug: string,
): Promise<ResolvedTeamEventType | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!workspace) return null;

  const eventType = await prisma.eventType.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: eventTypeSlug,
      },
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
          user: {
            select: {
              id: true,
              name: true,
              handle: true,
              image: true,
              timezone: true,
            },
          },
        },
      },
    },
  });
  if (!eventType) return null;

  if (eventType.hosts.length < 2) return null;

  return {
    id: eventType.id,
    workspaceId: eventType.workspaceId,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
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
    hostUsers: eventType.hosts.map((h) => ({
      id: h.user.id,
      name: h.user.name,
      handle: h.user.handle,
      image: h.user.image,
      timezone: h.user.timezone,
    })),
  };
}

export async function generateTeamUpcomingSlots(opts: {
  eventType: ResolvedTeamEventType;
  days: number;
  from?: Date;
}): Promise<
  ReadonlyArray<{
    start: string;
    end: string;
    status: "open";
  }>
> {
  const from = opts.from ?? new Date();
  const fixedHostIds = new Set(
    opts.eventType.hosts.filter((h) => h.isFixed).map((h) => h.userId),
  );
  const rotatingHostIds = opts.eventType.hosts
    .filter((h) => !h.isFixed)
    .map((h) => h.userId);
  const candidatePool =
    rotatingHostIds.length > 0
      ? rotatingHostIds
      : opts.eventType.hosts.map((h) => h.userId);

  const hostSlotMap = new Map<string, Set<number>>();

  for (const host of opts.eventType.hosts) {
    const userMeta = opts.eventType.hostUsers.find(
      (u) => u.id === host.userId,
    );
    if (!userMeta) continue;

    const ranges = await prisma.availabilityRange.findMany({
      where: { userId: host.userId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const baseSlots = generateUpcomingSlots({
      ranges,
      from,
      days: opts.days,
      stepMinutes: SLOT_MINUTES,
      hostTimezone: userMeta.timezone,
    });
    if (baseSlots.length === 0) {
      hostSlotMap.set(host.userId, new Set());
      continue;
    }

    const horizonStart = new Date(baseSlots[0].start);
    const horizonEnd = new Date(baseSlots[baseSlots.length - 1].end);
    const busy = await fetchHostBusyTimes({
      hostId: host.userId,
      from: horizonStart,
      to: horizonEnd,
    });
    const minusCalendar = subtractBusyTimes<ScheduleSlot>(baseSlots, busy);

    const bookings = await prisma.booking.findMany({
      where: {
        hostId: host.userId,
        deleted: false,
        slotStart: { gte: horizonStart, lte: horizonEnd },
      },
      select: { slotStart: true },
    });
    const taken = new Set(bookings.map((b) => b.slotStart.getTime()));

    hostSlotMap.set(
      host.userId,
      new Set(
        minusCalendar
          .map((s) => new Date(s.start).getTime())
          .filter((ms) => !taken.has(ms)),
      ),
    );
  }

  const allSlotMs = new Set<number>();
  for (const set of hostSlotMap.values()) {
    for (const ms of set) allSlotMs.add(ms);
  }

  const result: Array<{ start: string; end: string; status: "open" }> = [];
  for (const ms of [...allSlotMs].sort((a, b) => a - b)) {
    let allFixedAvailable = true;
    for (const fixedId of fixedHostIds) {
      if (!hostSlotMap.get(fixedId)?.has(ms)) {
        allFixedAvailable = false;
        break;
      }
    }
    if (!allFixedAvailable) continue;

    const anyCandidateAvailable = candidatePool.some((id) =>
      hostSlotMap.get(id)?.has(ms),
    );
    if (!anyCandidateAvailable) continue;

    const start = new Date(ms);
    const end = new Date(ms + opts.eventType.durationMins * 60_000);
    result.push({
      start: start.toISOString(),
      end: end.toISOString(),
      status: "open",
    });
  }

  return result;
}

export async function addHostToEventType(opts: {
  eventTypeId: string;
  userId: string;
  isFixed?: boolean;
  priority?: number;
  weight?: number;
}): Promise<{ id: string }> {
  const existing = await prisma.eventTypeHost.findMany({
    where: { eventTypeId: opts.eventTypeId, isFixed: false },
    select: { recentAssignments: true },
  });
  const backfillRecent =
    existing.length === 0
      ? 0
      : Math.round(
          existing.reduce((acc, row) => acc + row.recentAssignments, 0) /
            existing.length,
        );

  const created = await prisma.eventTypeHost.create({
    data: {
      eventTypeId: opts.eventTypeId,
      userId: opts.userId,
      isFixed: opts.isFixed ?? false,
      priority: opts.priority ?? 2,
      weight: opts.weight ?? 1,
      recentAssignments: backfillRecent,
    },
    select: { id: true },
  });
  return created;
}
