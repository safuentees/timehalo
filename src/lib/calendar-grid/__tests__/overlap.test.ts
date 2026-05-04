import { describe, it, expect } from "vitest";
import {
  sortEvents,
  buildOverlapGroups,
  calculateEventLayouts,
  createLayoutMap,
} from "../overlap";
import type { CalendarEvent } from "../types";

const event = (
  id: string,
  startISO: string,
  endISO: string,
): CalendarEvent => ({
  id,
  title: id,
  start: new Date(startISO),
  end: new Date(endISO),
  status: "confirmed",
});

describe("sortEvents", () => {
  it("sorts by start time ascending", () => {
    const a = event("a", "2026-05-04T10:00:00Z", "2026-05-04T10:30:00Z");
    const b = event("b", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const c = event("c", "2026-05-04T11:00:00Z", "2026-05-04T11:30:00Z");
    const sorted = sortEvents([a, b, c]);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("breaks start-time ties by end DESC (longer event first)", () => {
    const short = event("short", "2026-05-04T09:00:00Z", "2026-05-04T09:15:00Z");
    const long = event("long", "2026-05-04T09:00:00Z", "2026-05-04T10:00:00Z");
    expect(sortEvents([short, long]).map((e) => e.id)).toEqual(["long", "short"]);
  });
});

describe("buildOverlapGroups", () => {
  it("returns [] for empty input", () => {
    expect(buildOverlapGroups([])).toEqual([]);
  });

  it("puts non-overlapping events in separate groups", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const b = event("b", "2026-05-04T10:00:00Z", "2026-05-04T10:30:00Z");
    const groups = buildOverlapGroups(sortEvents([a, b]));
    expect(groups).toHaveLength(2);
    expect(groups[0].map((e) => e.id)).toEqual(["a"]);
    expect(groups[1].map((e) => e.id)).toEqual(["b"]);
  });

  it("groups two overlapping events together", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const b = event("b", "2026-05-04T09:15:00Z", "2026-05-04T09:45:00Z");
    const groups = buildOverlapGroups(sortEvents([a, b]));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("groups three concurrent events together (n=3 cascade)", () => {
    const owen = event("owen", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const greta = event("greta", "2026-05-04T09:00:00Z", "2026-05-04T09:45:00Z");
    const marcus = event("marcus", "2026-05-04T09:15:00Z", "2026-05-04T09:30:00Z");
    const groups = buildOverlapGroups(sortEvents([owen, greta, marcus]));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("treats touching-but-not-overlapping as separate groups", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T10:00:00Z");
    const b = event("b", "2026-05-04T10:00:00Z", "2026-05-04T11:00:00Z");
    const groups = buildOverlapGroups(sortEvents([a, b]));
    expect(groups).toHaveLength(2);
  });

  it("extends the group end to the latest end of any member", () => {
    const long = event("long", "2026-05-04T09:00:00Z", "2026-05-04T11:00:00Z");
    const short = event("short", "2026-05-04T09:30:00Z", "2026-05-04T10:00:00Z");
    const tail = event("tail", "2026-05-04T10:30:00Z", "2026-05-04T11:00:00Z");
    const groups = buildOverlapGroups(sortEvents([long, short, tail]));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
});

describe("calculateEventLayouts", () => {
  it("gives a single event nearly full width", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T10:00:00Z");
    const [layout] = calculateEventLayouts([a]);
    expect(layout.leftOffsetPercent).toBe(0);
    expect(layout.widthPercent).toBeGreaterThan(99);
    expect(layout.widthPercent).toBeLessThanOrEqual(100);
  });

  it("cascades two overlapping events left-to-right", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:45:00Z");
    const b = event("b", "2026-05-04T09:15:00Z", "2026-05-04T10:00:00Z");
    const layouts = calculateEventLayouts([a, b]);
    expect(layouts).toHaveLength(2);
    expect(layouts[0].event.id).toBe("a");
    expect(layouts[0].leftOffsetPercent).toBe(0);
    expect(layouts[1].event.id).toBe("b");
    expect(layouts[1].leftOffsetPercent).toBeGreaterThan(0);
  });

  it("splits 3 concurrent events across the column", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const b = event("b", "2026-05-04T09:00:00Z", "2026-05-04T09:45:00Z");
    const c = event("c", "2026-05-04T09:15:00Z", "2026-05-04T09:30:00Z");
    const layouts = calculateEventLayouts([a, b, c]);
    expect(layouts).toHaveLength(3);
    expect(layouts[0].leftOffsetPercent).toBeLessThan(
      layouts[1].leftOffsetPercent,
    );
    expect(layouts[1].leftOffsetPercent).toBeLessThan(
      layouts[2].leftOffsetPercent,
    );
    for (const l of layouts) expect(l.widthPercent).toBeGreaterThanOrEqual(25);
  });

  it("z-index increases within a group so later events stack on top", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:45:00Z");
    const b = event("b", "2026-05-04T09:15:00Z", "2026-05-04T10:00:00Z");
    const layouts = calculateEventLayouts([a, b]);
    expect(layouts[1].baseZIndex).toBeGreaterThan(layouts[0].baseZIndex);
  });

  it("groupIndex increments across separate overlap groups", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const b = event("b", "2026-05-04T11:00:00Z", "2026-05-04T11:30:00Z");
    const layouts = calculateEventLayouts([a, b]);
    expect(layouts[0].groupIndex).toBe(0);
    expect(layouts[1].groupIndex).toBe(1);
  });
});

describe("createLayoutMap", () => {
  it("indexes by event.id for O(1) lookup", () => {
    const a = event("a", "2026-05-04T09:00:00Z", "2026-05-04T09:30:00Z");
    const b = event("b", "2026-05-04T11:00:00Z", "2026-05-04T11:30:00Z");
    const map = createLayoutMap(calculateEventLayouts([a, b]));
    expect(map.get("a")?.event.id).toBe("a");
    expect(map.get("b")?.event.id).toBe("b");
    expect(map.get("missing")).toBeUndefined();
  });
});
