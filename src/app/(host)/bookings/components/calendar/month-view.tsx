"use client";

import { useMemo } from "react";
import {
  buildMonthGrid,
  dayOfWeekOrder,
  weekdayLabel,
  type WeekStart,
} from "@/lib/calendar-grid/month-grid";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { MonthDayCell } from "./month-day-cell";

// Month view — 7-column × 5-or-6-row grid of day cells.
//
// The grid is computed by `buildMonthGrid()`: takes any date inside
// the target month + a `weekStartsOn` (0 = Sun, 1 = Mon) and returns
// 35 or 42 cells with `isInMonth` flags so leading/trailing cells
// can dim.
//
// Events are pre-bucketed by local YYYY-MM-DD key once per render —
// a 35-cell month with 200 events does ~235 cell-membership checks,
// well below the budget for a 60fps render. Today's cell flag is
// computed once via the `now` snapshot prop (caller pins for tests/
// playground; production will pass `new Date()`).

export type MonthViewProps = {
  /** Any date inside the target month. */
  date: Date;
  events: CalendarEvent[];
  weekStartsOn?: WeekStart;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  onOverflowClick?: (date: Date, events: CalendarEvent[]) => void;
  /** Override "today" — useful for testing / playground pinning. */
  nowOverride?: Date;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function MonthView({
  date,
  events,
  weekStartsOn = 1,
  selectedRefId = null,
  onEventClick,
  onOverflowClick,
  nowOverride,
}: MonthViewProps) {
  const cells = useMemo(
    () => buildMonthGrid(date, weekStartsOn),
    [date, weekStartsOn],
  );

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(e.start);
      const bucket = map.get(k);
      if (bucket) bucket.push(e);
      else map.set(k, [e]);
    }
    return map;
  }, [events]);

  const today = nowOverride ?? new Date();
  const headerDays = dayOfWeekOrder(weekStartsOn);

  return (
    <div className="flex flex-col">
      {/* Weekday header row */}
      <div
        className="grid border-y border-oh-line"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {headerDays.map((d) => (
          <span
            key={d}
            className="border-r border-oh-line py-2 text-center oh-eyebrow opacity-100 last:border-r-0"
          >
            {weekdayLabel(d)}
          </span>
        ))}
      </div>

      {/* Day grid — borders on cells (right + bottom), parent owns
          the left + top. The `last-row last-col` cells lose their
          right/bottom via the `:last-child` selector on the cell. */}
      <div
        className="grid border-l border-oh-line"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {cells.map((cell) => (
          <MonthDayCell
            key={cell.date.toISOString()}
            date={cell.date}
            events={eventsByDayKey.get(dayKey(cell.date)) ?? []}
            isToday={isSameDay(cell.date, today)}
            isInMonth={cell.isInMonth}
            selectedRefId={selectedRefId}
            onEventClick={onEventClick}
            onOverflowClick={onOverflowClick}
          />
        ))}
      </div>
    </div>
  );
}
