import { describe, it, expect } from "vitest";
import {
  applyAssignment,
  selectHost,
  type Host,
} from "@/lib/round-robin";

const h = (
  id: string,
  priority = 0,
  weight = 1,
  recentAssignments = 0,
): Host => ({ id, priority, weight, recentAssignments });

describe("selectHost", () => {
  it("rejects an empty pool", () => {
    expect(selectHost({ hosts: [] })).toEqual({ kind: "no-hosts" });
  });

  it("rejects when every host is excluded", () => {
    const result = selectHost({
      hosts: [h("a"), h("b")],
      excludeHostIds: new Set(["a", "b"]),
    });
    expect(result).toEqual({ kind: "all-conflicted" });
  });

  it("picks the host with the lowest recentAssignments (no ties)", () => {
    const result = selectHost({
      hosts: [
        h("alice", 0, 1, 5),
        h("bob", 0, 1, 2),
        h("carol", 0, 1, 8),
      ],
    });
    expect(result).toEqual({ kind: "selected", hostId: "bob" });
  });

  it("respects priority — higher priority wins regardless of weight/assignments", () => {
    const result = selectHost({
      hosts: [
        h("alice", 1, 10, 0), // higher priority but heavily weighted
        h("bob", 0, 1, 0), // lower priority
      ],
    });
    expect(result).toEqual({ kind: "selected", hostId: "alice" });
  });

  it("weight halves the effective assignment count", () => {
    const result = selectHost({
      hosts: [h("alice", 0, 2, 4), h("bob", 0, 1, 3)],
    });
    expect(result).toEqual({ kind: "selected", hostId: "alice" });
  });

  it("excludes a host when their id is in excludeHostIds", () => {
    const result = selectHost({
      hosts: [h("alice", 0, 1, 0), h("bob", 0, 1, 1)],
      excludeHostIds: new Set(["alice"]),
    });
    expect(result).toEqual({ kind: "selected", hostId: "bob" });
  });

  it("ties break deterministically on host id (stable)", () => {
    const result = selectHost({
      hosts: [
        h("zara", 0, 1, 0),
        h("alex", 0, 1, 0),
        h("maya", 0, 1, 0),
      ],
    });
    expect(result).toEqual({ kind: "selected", hostId: "alex" });
  });
});

describe("applyAssignment", () => {
  it("increments recentAssignments on the selected host only", () => {
    const before: Host[] = [h("a", 0, 1, 1), h("b", 0, 1, 5)];
    const after = applyAssignment(before, "a");
    expect(after.find((x) => x.id === "a")?.recentAssignments).toBe(2);
    expect(after.find((x) => x.id === "b")?.recentAssignments).toBe(5);
  });

  it("does not mutate the input array", () => {
    const before: Host[] = [h("a", 0, 1, 1)];
    const snapshot = JSON.stringify(before);
    applyAssignment(before, "a");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("integration shape — round-robin over a sequence", () => {
  it("equal-weight hosts cycle in order with deterministic ties", () => {
    let pool: Host[] = [
      h("alice", 0, 1, 0),
      h("bob", 0, 1, 0),
      h("carol", 0, 1, 0),
    ];
    const picks: string[] = [];
    for (let i = 0; i < 6; i++) {
      const result = selectHost({ hosts: pool });
      if (result.kind !== "selected") break;
      picks.push(result.hostId);
      pool = applyAssignment(pool, result.hostId);
    }
    expect(picks).toEqual([
      "alice",
      "bob",
      "carol",
      "alice",
      "bob",
      "carol",
    ]);
  });

  it("weight=2 doubles the long-run pick rate", () => {
    let pool: Host[] = [h("heavy", 0, 2, 0), h("light", 0, 1, 0)];
    const counts: Record<string, number> = { heavy: 0, light: 0 };
    for (let i = 0; i < 30; i++) {
      const result = selectHost({ hosts: pool });
      if (result.kind !== "selected") break;
      counts[result.hostId] = (counts[result.hostId] ?? 0) + 1;
      pool = applyAssignment(pool, result.hostId);
    }
    expect(counts.heavy).toBe(20);
    expect(counts.light).toBe(10);
  });
});
