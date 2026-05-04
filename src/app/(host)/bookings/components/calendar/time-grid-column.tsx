"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  calculateEventLayouts,
  createLayoutMap,
} from "@/lib/calendar-grid/overlap";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { useCurrentMinute } from "@/lib/calendar-grid/use-current-minute";
import { EventChip } from "./event-chip";

// One-day time-grid column. Renders horizontal hour rules at every
// hour boundary inside the column, plus absolute-positioned
// EventChips for any events that fall on this date.
//
// Adapted from cal.com (MIT) — `apps/web/modules/calendars/weeklyview/
// components/event/EventList.tsx`. Adaptations:
//   - drops the zustand store; props-only (parent owns selection
//     state — matches our state-driven `<BookingDetailModal>` pattern
//     in `bookings-list.tsx`)
//   - `oneMinuteHeightPx` passed as a prop (parent owns scaling)
//     instead of cal.com's CSS variable approach. This makes Day
//     and Week views able to use different scales (Week is denser).
//   - cancelled bookings render with `line-through` + dashed border
//     in the chip itself, matching cal.com's REJECTED status look,
//     adapted to our --oh-status-cancelled token.
//
// Per the bookings-list cleanup convention, click handlers are
// passed up; this component is purely presentational. Selection
// state (`selectedRefId`) drives a ring on the matching chip.

export type TimeGridColumnProps = {
  /** The date this column represents (year/month/day matter; time
   *  is ignored). */
  date: Date;
  /** All events in this column's day — caller pre-filters. */
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
  /** Currently selected event's `refId` — chip gets a ring. */
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** Whether to render the current-time line. Caller passes true for
   *  the column matching today's date. */
  showCurrentTimeLine?: boolean;
  /** Override the "now" date for testing / Storybook. */
  nowOverride?: Date;
  className?: string;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function TimeGridColumn({
  date,
  events,
  startHour,
  endHour,
  oneMinuteHeightPx,
  selectedRefId = null,
  onEventClick,
  showCurrentTimeLine = false,
  nowOverride,
  className,
}: TimeGridColumnProps) {
  const tickedNow = useCurrentMinute();
  const now = nowOverride ?? tickedNow;

  const totalMinutes = (endHour - startHour + 1) * 60;
  const columnHeightPx = totalMinutes * oneMinuteHeightPx;

  // Layout calc — memoize on events identity since calculateEventLayouts
  // is O(n log n) and we'd rather not redo it per minute tick.
  const layouts = useMemo(
    () => calculateEventLayouts(events),
    [events],
  );
  const layoutMap = useMemo(() => createLayoutMap(layouts), [layouts]);

  // Hour rules
  const hourRules: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hourRules.push((h - startHour) * 60 * oneMinuteHeightPx);
  }

  // Current-time position — only painted if showCurrentTimeLine AND
  // the column's date matches today (caller usually pre-checks).
  const currentTimeLineTop = (() => {
    if (!showCurrentTimeLine) return null;
    if (!isSameDay(now, date)) return null;
    const minutesFromStart =
      (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromStart < 0 || minutesFromStart > totalMinutes) return null;
    return minutesFromStart * oneMinuteHeightPx;
  })();

  return (
    <div
      className={cn("relative flex-1 min-w-0", className)}
      style={{ height: `${columnHeightPx}px` }}
    >
      {/* Hour rules — hairlines at every hour boundary */}
      {hourRules.map((top, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute left-0 right-0 h-px bg-oh-line"
          style={{ top: `${top}px` }}
        />
      ))}

      {/* Events */}
      {events.map((event) => {
        const layout = layoutMap.get(event.id);
        if (!layout) return null;

        const minutesFromStart =
          (event.start.getHours() - startHour) * 60 + event.start.getMinutes();
        const eventDurationMinutes =
          (event.end.getTime() - event.start.getTime()) / 60_000;

        const top = minutesFromStart * oneMinuteHeightPx;
        const minHeightPx = 18;
        const heightPx = Math.max(
          minHeightPx,
          eventDurationMinutes * oneMinuteHeightPx,
        );

        const isSelected = selectedRefId !== null && event.refId === selectedRefId;

        return (
          <div
            key={event.id}
            className="absolute"
            style={{
              top: `${top}px`,
              height: `${heightPx}px`,
              left: `${layout.leftOffsetPercent}%`,
              width: `${layout.widthPercent}%`,
              zIndex: isSelected ? 79 : layout.baseZIndex,
            }}
          >
            <EventChip
              event={event}
              isSelected={isSelected}
              onClick={onEventClick}
            />
          </div>
        );
      })}

      {/* Current-time line — paper halo + ink line, dot on left edge */}
      {currentTimeLineTop !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 z-[80]"
          style={{ top: `${currentTimeLineTop}px` }}
        >
          <span className="absolute left-0 right-0 top-0 h-px bg-[color:var(--oh-status-confirmed)]" />
          <span
            className="absolute -left-1 -top-1 size-2 rounded-full bg-[color:var(--oh-status-confirmed)]"
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}
