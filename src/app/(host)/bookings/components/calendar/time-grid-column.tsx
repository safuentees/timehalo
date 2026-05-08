"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  calculateEventLayouts,
  createLayoutMap,
} from "@/lib/calendar-grid/overlap";
import { eventToGridPosition } from "@/lib/calendar-grid/event-geometry";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { useCurrentMinute } from "@/lib/calendar-grid/use-current-minute";
import { DraggableEventChip } from "./draggable-event-chip";

// B.PT150 — drop-zone identity. Each TimeGridColumn registers as a
// separate `useDroppable` so dnd-kit can route the active drag to
// the right day even in WeekView (7 columns side-by-side). The
// column's `data` payload carries the date + geometry so the drop
// handler at the BookingsList level can compute pixelToTime without
// re-deriving the column.
export type TimeGridDropData = {
  type: "time-grid-column";
  /** ISO date "YYYY-MM-DD" — easier for parents to switch on than
   *  comparing Date objects (which have time + tz noise). */
  dateIso: string;
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
};

function dateIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  /** Optional href getter for cmd+click parity with list rows
   *  (B.PT142). Returns the standalone `/bookings/<uid>` URL or
   *  similar so modifier clicks can open in a new tab. */
  getHref?: (event: CalendarEvent) => string;
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
  getHref,
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

  // B.PT150 — register as a drop zone. The id is the column's date
  // so dnd-kit can deduplicate (one column per date) and parents can
  // detect the drop target's date from `event.over?.id`. The full
  // geometry payload travels via `data` so the drop handler doesn't
  // need to re-derive it.
  const dropData: TimeGridDropData = {
    type: "time-grid-column",
    dateIso: dateIsoLocal(date),
    startHour,
    endHour,
    oneMinuteHeightPx,
  };
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column-${dropData.dateIso}`,
    data: dropData,
  });

  // Current-time position — only painted if showCurrentTimeLine AND
  // the hook has filled in a wall-clock value (null on SSR + first
  // render to avoid hydration mismatch — see use-current-minute.ts)
  // AND the column's date matches today (caller usually pre-checks).
  const currentTimeLineTop = (() => {
    if (!showCurrentTimeLine) return null;
    if (!now) return null;
    if (!isSameDay(now, date)) return null;
    const minutesFromStart =
      (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromStart < 0 || minutesFromStart > totalMinutes) return null;
    return minutesFromStart * oneMinuteHeightPx;
  })();

  return (
    <div
      ref={setDropRef}
      data-drop-active={isOver ? "" : undefined}
      className={cn(
        "relative flex-1 min-w-0",
        // Subtle drop-target highlight while a drag is over this
        // column. Reads as a soft tint flash, not a popping outline
        // — quieter chrome convention.
        isOver && "bg-[color:var(--oh-tint)]",
        className,
      )}
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

      {/* Events. Out-of-range events are clipped to the visible
          window via `eventToGridPosition` (B.PT147 — pure-function
          extraction; previously inline math). The same helper feeds
          the future drag-to-reschedule preview: a drag handler
          builds a ghost event with new start/end and pipes it
          through `eventToGridPosition` to render the dragging
          chip's top + height. */}
      {events.map((event) => {
        const layout = layoutMap.get(event.id);
        if (!layout) return null;

        const pos = eventToGridPosition(event, {
          startHour,
          endHour,
          oneMinuteHeightPx,
        });
        if (!pos.isVisible) return null;

        const isSelected =
          selectedRefId !== null && event.refId === selectedRefId;
        const href = getHref ? getHref(event) : undefined;

        return (
          <div
            key={event.id}
            className="absolute"
            style={{
              top: `${pos.top}px`,
              height: `${pos.height}px`,
              left: `${layout.leftOffsetPercent}%`,
              width: `${layout.widthPercent}%`,
              zIndex: isSelected ? 79 : layout.baseZIndex,
            }}
          >
            <DraggableEventChip
              event={event}
              isSelected={isSelected}
              onClick={onEventClick}
              href={href}
              // Cancelled bookings can't be rescheduled (the procedure
              // would 404 on the soft-deleted row anyway). Keep the
              // chip clickable for detail view, just not draggable.
              disabled={event.status === "cancelled"}
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
