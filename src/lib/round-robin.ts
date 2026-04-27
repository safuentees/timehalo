// Round-robin host selection (C3). Pure algorithm — no DB, no IO.
// Schema integration is deferred until the booking flow migrates
// from User-centric to Workspace-centric (B1 deferral chain). The
// shape lands here so it's testable + ready when integration lands.
//
// Pattern reference: cal /packages/features/host/services/
// EventTypeHostService.ts:32-99 — fixed hosts (must be present)
// separated from a round-robin pool, priority + weight on each
// pool member, cursor advances after every assignment.

export type Host = {
  id: string;
  /** Higher priority hosts are picked first when their slot is up. */
  priority: number;
  /**
   * How often a host gets picked relative to others at the same
   * priority. A host with weight 2 is picked twice as often as a
   * host with weight 1. Whole numbers; clamped to 1 minimum.
   */
  weight: number;
  /** Assignment count over the lookback window — drives the rotation. */
  recentAssignments: number;
};

export type SelectionResult =
  | { kind: "selected"; hostId: string }
  | { kind: "no-hosts" }
  | { kind: "all-conflicted" };

/**
 * Pick the next host for a slot.
 *
 * Algorithm:
 *   1. Reject the empty pool.
 *   2. Pick hosts at the highest priority tier (lower priority
 *      tiers are skipped while higher tiers have available
 *      members).
 *   3. Filter out hosts whose id is in `excludeHostIds` — caller
 *      passes any host who's already booked at this slot.
 *   4. Among the remaining tier members, score by
 *      `recentAssignments / weight`. Lower score wins (longest-
 *      since-picked, weighted). Ties break on host id (stable).
 *   5. Return the winner.
 *
 * The "weight" mechanism gives the host with weight=2 twice as
 * many bookings as weight=1 over the long run. cal.com's variant
 * tracks recentAssignments explicitly; we treat the value as
 * caller-provided so the function stays pure.
 */
export function selectHost(opts: {
  hosts: ReadonlyArray<Host>;
  excludeHostIds?: ReadonlySet<string>;
}): SelectionResult {
  if (opts.hosts.length === 0) return { kind: "no-hosts" };

  const excluded = opts.excludeHostIds ?? new Set<string>();
  const eligible = opts.hosts.filter((h) => !excluded.has(h.id));
  if (eligible.length === 0) return { kind: "all-conflicted" };

  // Highest-priority tier first.
  const maxPriority = Math.max(...eligible.map((h) => h.priority));
  const tier = eligible.filter((h) => h.priority === maxPriority);

  // Score = recentAssignments / max(weight, 1). Lower = picked next.
  const scored = tier
    .map((h) => ({
      host: h,
      score: h.recentAssignments / Math.max(h.weight, 1),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      // Stable tiebreak — id sort makes the result deterministic
      // for tests + idempotent for any caller.
      return a.host.id.localeCompare(b.host.id);
    });

  return { kind: "selected", hostId: scored[0].host.id };
}

/**
 * Apply an assignment — increments the picked host's
 * recentAssignments by 1. Returns a new array; the input is not
 * mutated. Used by callers that maintain pool state in memory or
 * by a DB-backed wrapper that wants to compute the next state
 * before persisting.
 */
export function applyAssignment(
  hosts: ReadonlyArray<Host>,
  selectedHostId: string,
): Host[] {
  return hosts.map((h) =>
    h.id === selectedHostId
      ? { ...h, recentAssignments: h.recentAssignments + 1 }
      : h,
  );
}
