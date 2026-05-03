import "server-only";
import { prisma } from "@/lib/prisma";
import { generateUpcomingSlots } from "@/lib/schedule";
import {
  fetchHostBusyTimes,
  subtractBusyTimes,
  type Slot as ScheduleSlot,
} from "@/lib/calendar";
import type { Host as RoundRobinHost } from "@/lib/round-robin";

// Team event-type resolution + slot generation (B.PT62). The
// `/w/<slug>/<eventTypeSlug>` route hits both helpers — the server
// page prefetches event-type metadata + the union-slot list, the
// `bookForTeam` procedure re-resolves to run the round-robin pick
// at booking time.
//
// Distinct from `event-types.ts:resolveEventTypeForHandle` —
// that one resolves a personal handle's singleton event type.
// Team event types are workspace-scoped: keyed by (workspaceSlug,
// eventTypeSlug) instead of a user handle.

const SLOT_MINUTES = 15;

export type ResolvedTeamEventType = {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  slug: string;
  name: string;
  durationMins: number;
  /** Hosts shaped for `selectHost` from src/lib/round-robin.ts. */
  hosts: ReadonlyArray<
    RoundRobinHost & { isFixed: boolean; userId: string }
  >;
  /** Snapshot of the host pool's user-facing data — used by the
   * server page to render member avatars without an extra round-trip. */
  hostUsers: ReadonlyArray<{
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
    timezone: string;
  }>;
};

/**
 * Resolve the team event type bookable at
 * `/w/<workspaceSlug>/<eventTypeSlug>`. Returns null when the
 * workspace doesn't exist, the event type doesn't exist on that
 * workspace, OR the event type has fewer than 2 hosts (single-host
 * event types use `/h/<handle>`, not `/w/<slug>/<event-type>` —
 * implicit per branch 1 of B.PT62).
 *
 * Caller maps null → 404 / NOT_FOUND.
 */
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

  // Branch 1 of B.PT62 (implicit team-type schema). >1 hosts =
  // team event type. Singleton-host event types are personal,
  // routed at /h/<handle>; not bookable through the team URL even
  // if a curl probes the workspace path.
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

/**
 * Generate the union of host availability for a team event type.
 *
 * Algorithm:
 *   1. For each host in the pool, build their personal slot set
 *      (availability ranges → upcoming slots, minus calendar-busy,
 *      minus already-booked rows on the same eventTypeId).
 *   2. Take the union of slot start timestamps.
 *   3. For each candidate slot:
 *      - REQUIRE all FIXED hosts have it (collective-attend semantics
 *        for the must-be-present hosts; cal.com pattern via
 *        `getQualifiedHostsService` filtering on isFixed).
 *      - REQUIRE at least one ROTATING host has it (the round-robin
 *        algorithm picks among them at booking time). When the pool
 *        has zero rotating hosts (all fixed — collective-only event
 *        type), every host is the candidate pool by definition.
 *
 * Returns slots in ascending order, capped at `days` worth.
 */
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

  // Per-host slot map: userId → Set<slotStart-as-ms>. The set form
  // gives O(1) "does this host have this slot?" lookups when we
  // filter the union.
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

  // Union of slot start times across all hosts. Sort ascending so
  // the visitor sees morning → evening order in each day group.
  const allSlotMs = new Set<number>();
  for (const set of hostSlotMap.values()) {
    for (const ms of set) allSlotMs.add(ms);
  }

  const result: Array<{ start: string; end: string; status: "open" }> = [];
  for (const ms of [...allSlotMs].sort((a, b) => a - b)) {
    // All fixed hosts must have it.
    let allFixedAvailable = true;
    for (const fixedId of fixedHostIds) {
      if (!hostSlotMap.get(fixedId)?.has(ms)) {
        allFixedAvailable = false;
        break;
      }
    }
    if (!allFixedAvailable) continue;

    // At least one candidate-pool host must have it.
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

/**
 * Add a host to an event type's pool with branch-C insert-time
 * fairness backfill (B.PT62 branch 4 — hybrid).
 *
 * Without backfill, a new host's `recentAssignments=0` makes them
 * "due" for every booking until they catch up to existing hosts'
 * counters — bombing the new host. Cal.com solves this via a
 * monthly cron reset; lab defers the cron and instead seeds the
 * new row's counter with the AVERAGE of the current pool's
 * counters, so the new host enters in fairness equilibrium. If
 * the average proves insufficient over a year of operation, the
 * cron path still becomes available without invalidating the
 * inserts done under this scheme.
 *
 * Returns the created EventTypeHost row's id.
 */
export async function addHostToEventType(opts: {
  eventTypeId: string;
  userId: string;
  isFixed?: boolean;
  priority?: number;
  weight?: number;
}): Promise<{ id: string }> {
  // Compute the average over EXISTING (non-fixed) hosts. Fixed
  // hosts always attend so their assignment count isn't the
  // benchmark. If the pool is empty (first host added) the
  // backfill is just 0 — the natural starting state.
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
