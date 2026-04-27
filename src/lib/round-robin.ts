
export type Host = {
  id: string;
  priority: number;
  weight: number;
  recentAssignments: number;
};

export type SelectionResult =
  | { kind: "selected"; hostId: string }
  | { kind: "no-hosts" }
  | { kind: "all-conflicted" };

export function selectHost(opts: {
  hosts: ReadonlyArray<Host>;
  excludeHostIds?: ReadonlySet<string>;
}): SelectionResult {
  if (opts.hosts.length === 0) return { kind: "no-hosts" };

  const excluded = opts.excludeHostIds ?? new Set<string>();
  const eligible = opts.hosts.filter((h) => !excluded.has(h.id));
  if (eligible.length === 0) return { kind: "all-conflicted" };

  const maxPriority = Math.max(...eligible.map((h) => h.priority));
  const tier = eligible.filter((h) => h.priority === maxPriority);

  const scored = tier
    .map((h) => ({
      host: h,
      score: h.recentAssignments / Math.max(h.weight, 1),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.host.id.localeCompare(b.host.id);
    });

  return { kind: "selected", hostId: scored[0].host.id };
}

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
