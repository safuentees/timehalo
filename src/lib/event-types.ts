import "server-only";
import { prisma } from "@/lib/prisma";
import type { Host as RoundRobinHost } from "@/lib/round-robin";

// Event-type resolution layer (B2). Translates a public handle into
// the EventType + host pool the booking flow needs. Single source of
// truth so bookings.create + bookings.reschedule + future
// public/api/v1/event-types reads all share the same shape.
//
// Backfill (20260428202405) seeded one EventType per User (slug =
// User.handle, single fixed EventTypeHost = the user). New users go
// through this same shape via auth.register / bootstrapUserWorkspace.
// Explicit "create event type" calls live on the workspaces.eventTypes
// router (B.PT4); the backfill handles every pre-PT4 account.

export type ResolvedEventType = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  durationMins: number;
  /**
   * Raw JSON-stringified Int[] of host-configured visitor-selectable
   * durations (B.PT158). Empty `[]` → single-duration mode (the chip
   * strip + bookings.create fall back to `durationMins`). Caller
   * passes this into `resolveDurationChoices` from `@/lib/durations`
   * to get a validated list.
   */
  durationMinsList: string;
  /** Hosts shaped for `selectHost` from src/lib/round-robin.ts. */
  hosts: ReadonlyArray<RoundRobinHost & { isFixed: boolean; userId: string }>;
};

/**
 * Look up the EventType bookable at `/h/<handle>`. Returns null when
 * the handle has no event type (e.g. user deleted, pre-backfill
 * account). Caller maps null → 404 / NOT_FOUND.
 *
 * The `User.handle` → `EventType.slug` mapping is by convention from
 * the backfill: every existing user got an EventType with slug =
 * handle. Multi-host event types in the future will use a different
 * slug surface (e.g. `/w/<workspace>/<event-type-slug>`); the public
 * /h/<handle> URL stays user-keyed for backwards compat.
 */
export async function resolveEventTypeForHandle(
  handle: string,
): Promise<ResolvedEventType | null> {
  // The handle's owning user has a Workspace they own (auth.register
  // guarantees it), and the EventType was seeded with workspaceId =
  // that workspace. We resolve via the user's primary workspace +
  // matching slug. Slug uniqueness is per-workspace (@@unique on
  // workspaceId+slug) so the join is safe.
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
      durationMinsList: true,
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
    durationMinsList: eventType.durationMinsList,
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

/**
 * After a booking lands on host X via the round-robin pick,
 * increment the corresponding EventTypeHost.recentAssignments so the
 * next pick weighs this assignment. Failure is non-fatal: if the row
 * disappeared (concurrent delete) the booking still committed; the
 * caller swallows the error.
 *
 * No-op for fixed hosts where the pick was inevitable — the lookback
 * counter is a fairness signal for the rotation, not a billing one.
 */
export async function bumpRecentAssignments(opts: {
  eventTypeId: string;
  userId: string;
}): Promise<void> {
  await prisma.eventTypeHost.updateMany({
    where: { eventTypeId: opts.eventTypeId, userId: opts.userId },
    data: { recentAssignments: { increment: 1 } },
  });
}
