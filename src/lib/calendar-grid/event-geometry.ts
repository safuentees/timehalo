// Pure functions mapping calendar events to/from pixel positions on a
// time-grid column. Extracted from `time-grid-column.tsx` so:
//   1. The math has its own contract + tests (round-trip and clipping
//      invariants are now first-class assertions, not buried in a
//      render loop).
//   2. A future drag-to-reschedule handler has a clean entry point —
//      it computes a candidate slot from cursor pixels via
//      `pixelToTime()`, builds a ghost event, and feeds it back to
//      `eventToGridPosition()` to render the drag preview.
//
// Pure TS, no React, zero deps. Pairs with `overlap.ts` (horizontal
// layout) — together they cover all the geometry a chip needs.

import type { CalendarEvent } from "./types";

export type GridPositionOptions = {
  /** Inclusive start hour (e.g. 7 = 7am). */
  startHour: number;
  /** Inclusive end hour (e.g. 20 = 8pm). The visible window is
   *  [startHour, endHour + 1] hours, i.e. (endHour - startHour + 1)
   *  * 60 minutes total. Matches the convention in `time-grid-
   *  column.tsx` where hour-axis labels render at startHour, and
   *  the column's height is computed as `(endHour - startHour + 1)
   *  * 60 * oneMinuteHeightPx`. */
  endHour: number;
  /** Pixels per minute. Default in production is 1 (= 60px/hour,
   *  matching cal.com's `--one-minute-height: 1px`). */
  oneMinuteHeightPx: number;
  /** Minimum chip height in pixels. Events shorter than this still
   *  render at this height so they're tappable + readable. Default
   *  18px (matches the existing `time-grid-column.tsx` constant). */
  minHeightPx?: number;
};

export type EventGridPosition =
  | { isVisible: false }
  | {
      isVisible: true;
      /** CSS `top` value in pixels, relative to the column's top edge. */
      top: number;
      /** CSS `height` value in pixels. Floored at `minHeightPx`. */
      height: number;
      /** Was the event clipped because part of it falls outside
       *  [startHour, endHour]? Drag handlers can use this to decide
       *  whether to anchor at the clipped edge or the original time. */
      clippedTop: boolean;
      clippedBottom: boolean;
    };

const DEFAULT_MIN_HEIGHT_PX = 18;

/**
 * Compute the pixel position of a calendar event within a time-grid
 * column. Events outside the visible window return `{ isVisible: false }`.
 * Events partially outside are clipped to the boundary.
 */
export function eventToGridPosition(
  event: CalendarEvent,
  opts: GridPositionOptions,
): EventGridPosition {
  const {
    startHour,
    endHour,
    oneMinuteHeightPx,
    minHeightPx = DEFAULT_MIN_HEIGHT_PX,
  } = opts;
  const totalMinutes = (endHour - startHour + 1) * 60;

  const eventStartMin =
    (event.start.getHours() - startHour) * 60 + event.start.getMinutes();
  const eventEndMin =
    (event.end.getHours() - startHour) * 60 + event.end.getMinutes();

  // Entirely outside the visible window
  if (eventEndMin <= 0 || eventStartMin >= totalMinutes) {
    return { isVisible: false };
  }

  const clippedStartMin = Math.max(0, eventStartMin);
  const clippedEndMin = Math.min(totalMinutes, eventEndMin);
  const clippedDurationMin = clippedEndMin - clippedStartMin;

  return {
    isVisible: true,
    top: clippedStartMin * oneMinuteHeightPx,
    height: Math.max(minHeightPx, clippedDurationMin * oneMinuteHeightPx),
    clippedTop: eventStartMin < 0,
    clippedBottom: eventEndMin > totalMinutes,
  };
}

/**
 * Inverse of `eventToGridPosition` for the time axis: given a Y pixel
 * within the column (relative to the column's top edge), return the
 * corresponding wall-clock time on the given date.
 *
 * For drag-to-reschedule: the drag handler reads the cursor's Y position
 * relative to the column, pipes it through this, and gets a new
 * slotStart for the candidate booking. The candidate event is then fed
 * back to `eventToGridPosition` to render the drag preview.
 *
 * @param yPx pixel offset from the column's top edge (positive going down)
 * @param date the column's date — only year/month/day are used; the
 *             returned Date carries the column's date + the computed time
 * @param opts geometry options (same shape used by `eventToGridPosition`)
 * @returns a Date with the column's date + time = `startHour:00 + (yPx / oneMinuteHeightPx)` minutes
 */
export function pixelToTime(
  yPx: number,
  date: Date,
  opts: Pick<GridPositionOptions, "startHour" | "oneMinuteHeightPx">,
): Date {
  const { startHour, oneMinuteHeightPx } = opts;
  const minutesFromStart = yPx / oneMinuteHeightPx;
  const totalMinutes = startHour * 60 + minutesFromStart;
  const hour = Math.floor(totalMinutes / 60);
  const minute = Math.round(totalMinutes - hour * 60);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

/**
 * Snap a pixel Y to the nearest grid step (e.g. 15 minutes) and return
 * the corresponding pixel position. Useful for drag-to-reschedule UX
 * where the chip should jump in 15-minute increments rather than
 * pixel-perfect.
 */
export function snapPixelToGrid(
  yPx: number,
  opts: Pick<GridPositionOptions, "oneMinuteHeightPx"> & {
    /** Snap interval in minutes. Default 15. */
    stepMinutes?: number;
  },
): number {
  const { oneMinuteHeightPx, stepMinutes = 15 } = opts;
  const stepPx = stepMinutes * oneMinuteHeightPx;
  return Math.round(yPx / stepPx) * stepPx;
}
