// Overlap-collision layout algorithm for time-grid calendar events.
//
// Adapted from cal.com (MIT) — `packages/features/calendars/weeklyview/
// utils/overlap.ts`. The math is unchanged from the upstream; the
// adaptations are:
//   - replaces `dayjs` with native Date `.getTime()` (the project
//     doesn't use dayjs)
//   - pure TS, no dependencies — works in client and tRPC test
//     contexts without an env stub
//   - `EventLayout.event.id` typed as string (project uses `publicUid`
//     strings, cal.com uses numeric ids)
//
// The algorithm: sort events by start ASC, then end DESC (longer
// events first when starts tie). Sweep events left-to-right, group
// any that overlap (one starts before another ends). Per group,
// compute variable widths so the leftmost event takes the most width
// and the rightmost the least — the cascade reads naturally because
// the user's eye lands on the earliest event first. Layout returns
// `leftOffsetPercent + widthPercent` so the caller can render via
// CSS `position: absolute; left: X%; width: Y%`.
//
// See `overlap.test.ts` for the contract — every behavior the
// algorithm guarantees has a named test case.

import type { CalendarEvent } from "./types";

export type OverlapLayoutConfig = {
  baseZIndex?: number;
  safetyMarginPercent?: number;
  minWidthPercent?: number;
  curveExponent?: number;
};

export type EventLayout = {
  event: CalendarEvent;
  leftOffsetPercent: number;
  widthPercent: number;
  baseZIndex: number;
  groupIndex: number;
  indexInGroup: number;
};

const DEFAULT_CONFIG: Required<OverlapLayoutConfig> = {
  baseZIndex: 60,
  safetyMarginPercent: 0.5,
  minWidthPercent: 25,
  curveExponent: 1.3,
};

function calculateVariableWidths(
  groupSize: number,
  minWidthPercent: number,
  curveExponent: number,
): number[] {
  if (groupSize <= 1) return [100];

  let wFirst: number;
  let wLast: number;

  if (groupSize === 2) {
    wFirst = 80;
    wLast = 50;
  } else if (groupSize === 3) {
    wFirst = 55;
    wLast = 33;
  } else if (groupSize === 4) {
    wFirst = 40;
    wLast = 25;
  } else {
    wFirst = Math.max(30, 40 - 3 * (groupSize - 4));
    wLast = minWidthPercent;
  }

  const widths: number[] = [];
  for (let i = 0; i < groupSize; i++) {
    const t = groupSize > 1 ? i / (groupSize - 1) : 0;
    const easedT = Math.pow(1 - t, curveExponent);
    const width = wLast + (wFirst - wLast) * easedT;
    widths.push(Math.max(minWidthPercent, width));
  }
  return widths;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function floor3(value: number): number {
  return Math.floor(value * 1000) / 1000;
}

/**
 * Sort events by start time ASC, then end time DESC (longer events
 * win when starts tie — they get the widest column in the cascade).
 */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const startDiff = a.start.getTime() - b.start.getTime();
    if (startDiff !== 0) return startDiff;
    return b.end.getTime() - a.end.getTime();
  });
}

/**
 * Sweep-group sorted events. Two events are in the same group iff
 * one starts before the other ends. The group's `currentGroupEnd`
 * extends to the latest end any member event reaches.
 */
export function buildOverlapGroups(
  sortedEvents: CalendarEvent[],
): CalendarEvent[][] {
  if (sortedEvents.length === 0) return [];

  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [sortedEvents[0]];
  let currentGroupEnd = sortedEvents[0].end.getTime();

  for (let i = 1; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    const eventStart = event.start.getTime();
    const eventEnd = event.end.getTime();

    if (eventStart < currentGroupEnd) {
      currentGroup.push(event);
      if (eventEnd > currentGroupEnd) currentGroupEnd = eventEnd;
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
      currentGroupEnd = eventEnd;
    }
  }
  groups.push(currentGroup);
  return groups;
}

/**
 * Compute layout (left + width as % of the column, plus z-index)
 * for every event. Single events get `[0%, 100%-safetyMargin]`;
 * groups get a cascade of variable widths spreading left-to-right.
 */
export function calculateEventLayouts(
  events: CalendarEvent[],
  config: OverlapLayoutConfig = {},
): EventLayout[] {
  const { baseZIndex, safetyMarginPercent, minWidthPercent, curveExponent } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const sortedEvents = sortEvents(events);
  const groups = buildOverlapGroups(sortedEvents);

  const layouts: EventLayout[] = [];

  groups.forEach((group, groupIndex) => {
    const groupSize = group.length;
    const widths = calculateVariableWidths(
      groupSize,
      minWidthPercent,
      curveExponent,
    );
    const Rmax = 100 - safetyMarginPercent;

    if (groupSize === 1) {
      const width = floor3(Math.min(widths[0], Rmax));
      layouts.push({
        event: group[0],
        leftOffsetPercent: 0,
        widthPercent: width,
        baseZIndex: baseZIndex,
        groupIndex,
        indexInGroup: 0,
      });
    } else {
      const Rmin = widths[0];

      group.forEach((event, indexInGroup) => {
        const t = indexInGroup / (groupSize - 1);
        const ri = Rmin + (Rmax - Rmin) * t;
        const leftRaw = ri - widths[indexInGroup];
        const left = round3(leftRaw);

        const maxWidthCap = Rmax - left;
        const widthCap = Math.min(widths[indexInGroup], maxWidthCap);
        const width = floor3(Math.max(0, widthCap));

        layouts.push({
          event,
          leftOffsetPercent: left,
          widthPercent: width,
          baseZIndex: baseZIndex + indexInGroup,
          groupIndex,
          indexInGroup,
        });
      });
    }
  });

  return layouts;
}

/**
 * Build a Map<event.id, EventLayout> for O(1) lookup during render.
 */
export function createLayoutMap(
  layouts: EventLayout[],
): Map<string, EventLayout> {
  const map = new Map<string, EventLayout>();
  for (const layout of layouts) map.set(layout.event.id, layout);
  return map;
}
