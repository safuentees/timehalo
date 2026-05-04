import { describe, it, expect } from "vitest";
import {
  eventToGridPosition,
  pixelToTime,
  snapPixelToGrid,
} from "../event-geometry";
import type { CalendarEvent } from "../types";

const event = (
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
): CalendarEvent => ({
  id: "x",
  title: "x",
  start: new Date(2026, 4, 4, startHour, startMin),
  end: new Date(2026, 4, 4, endHour, endMin),
  status: "confirmed",
});

const OPTS = {
  startHour: 7,
  endHour: 20,
  oneMinuteHeightPx: 1,
};

describe("eventToGridPosition", () => {
  it("renders a 30-min 9am-9:30 event at top=120 height=30", () => {
    const result = eventToGridPosition(event(9, 0, 9, 30), OPTS);
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      expect(result.top).toBe(120); // (9 - 7) * 60 = 120 minutes from window start
      expect(result.height).toBe(30); // 30 minute duration × 1px/min
      expect(result.clippedTop).toBe(false);
      expect(result.clippedBottom).toBe(false);
    }
  });

  it("renders the first hour event at top=0", () => {
    const result = eventToGridPosition(event(7, 0, 8, 0), OPTS);
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      expect(result.top).toBe(0);
      expect(result.height).toBe(60);
    }
  });

  it("floors very short events at minHeightPx", () => {
    const result = eventToGridPosition(event(9, 0, 9, 5), OPTS);
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      expect(result.height).toBe(18); // default minHeightPx
    }
  });

  it("returns isVisible=false for events entirely before the window", () => {
    const result = eventToGridPosition(event(5, 0, 6, 0), OPTS);
    expect(result.isVisible).toBe(false);
  });

  it("returns isVisible=false for events entirely after the window", () => {
    const result = eventToGridPosition(event(22, 0, 23, 0), OPTS);
    expect(result.isVisible).toBe(false);
  });

  it("clips events that start before the window's startHour", () => {
    const result = eventToGridPosition(event(6, 30, 7, 30), OPTS);
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      expect(result.top).toBe(0);
      expect(result.height).toBe(30); // only 30 min visible
      expect(result.clippedTop).toBe(true);
      expect(result.clippedBottom).toBe(false);
    }
  });

  it("clips events that end after the window's endHour+1", () => {
    const result = eventToGridPosition(event(20, 30, 21, 30), OPTS);
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      const expectedStartMin = (20 - 7) * 60 + 30; // 810
      expect(result.top).toBe(expectedStartMin);
      expect(result.height).toBeGreaterThan(18); // clipped to ~30 min
      expect(result.clippedTop).toBe(false);
      expect(result.clippedBottom).toBe(true);
    }
  });

  it("scales with custom oneMinuteHeightPx", () => {
    const result = eventToGridPosition(event(9, 0, 9, 30), {
      ...OPTS,
      oneMinuteHeightPx: 2,
    });
    expect(result.isVisible).toBe(true);
    if (result.isVisible) {
      expect(result.top).toBe(240); // 2px/min instead of 1
      expect(result.height).toBe(60);
    }
  });
});

describe("pixelToTime", () => {
  const date = new Date(2026, 4, 4);

  it("converts top=0 to startHour:00", () => {
    const t = pixelToTime(0, date, { startHour: 7, oneMinuteHeightPx: 1 });
    expect(t.getHours()).toBe(7);
    expect(t.getMinutes()).toBe(0);
  });

  it("converts top=60 to startHour+1:00", () => {
    const t = pixelToTime(60, date, { startHour: 7, oneMinuteHeightPx: 1 });
    expect(t.getHours()).toBe(8);
    expect(t.getMinutes()).toBe(0);
  });

  it("converts top=135 to 9:15 with startHour=7", () => {
    const t = pixelToTime(135, date, { startHour: 7, oneMinuteHeightPx: 1 });
    expect(t.getHours()).toBe(9);
    expect(t.getMinutes()).toBe(15);
  });

  it("scales with custom oneMinuteHeightPx", () => {
    const t = pixelToTime(120, date, { startHour: 7, oneMinuteHeightPx: 2 });
    expect(t.getHours()).toBe(8);
    expect(t.getMinutes()).toBe(0);
  });

  it("preserves the column's date", () => {
    const t = pixelToTime(135, date, { startHour: 7, oneMinuteHeightPx: 1 });
    expect(t.getFullYear()).toBe(2026);
    expect(t.getMonth()).toBe(4);
    expect(t.getDate()).toBe(4);
  });
});

describe("round-trip eventToGridPosition + pixelToTime", () => {
  const date = new Date(2026, 4, 4);

  it("preserves the start time across a round-trip (no minHeight floor)", () => {
    const e = event(9, 30, 11, 0); // long enough that minHeight doesn't clamp
    const pos = eventToGridPosition(e, OPTS);
    expect(pos.isVisible).toBe(true);
    if (pos.isVisible) {
      const recovered = pixelToTime(pos.top, date, OPTS);
      expect(recovered.getHours()).toBe(9);
      expect(recovered.getMinutes()).toBe(30);
    }
  });
});

describe("snapPixelToGrid", () => {
  it("snaps to 15-minute steps with default", () => {
    expect(snapPixelToGrid(7, { oneMinuteHeightPx: 1 })).toBe(0); // round to 0
    expect(snapPixelToGrid(8, { oneMinuteHeightPx: 1 })).toBe(15); // round to 15
    expect(snapPixelToGrid(22, { oneMinuteHeightPx: 1 })).toBe(15); // round to 15
    expect(snapPixelToGrid(23, { oneMinuteHeightPx: 1 })).toBe(30); // round to 30
  });

  it("supports custom step size", () => {
    expect(
      snapPixelToGrid(35, { oneMinuteHeightPx: 1, stepMinutes: 30 }),
    ).toBe(30);
    expect(
      snapPixelToGrid(45, { oneMinuteHeightPx: 1, stepMinutes: 30 }),
    ).toBe(60);
  });

  it("scales with oneMinuteHeightPx", () => {
    expect(snapPixelToGrid(14, { oneMinuteHeightPx: 2 })).toBe(0); // 14/30 ≈ 0.47 → 0
    expect(snapPixelToGrid(15, { oneMinuteHeightPx: 2 })).toBe(30); // 15/30 = 0.5 → 1 → 30
    expect(snapPixelToGrid(45, { oneMinuteHeightPx: 2 })).toBe(60); // 45/30 = 1.5 → 2 → 60
  });
});
