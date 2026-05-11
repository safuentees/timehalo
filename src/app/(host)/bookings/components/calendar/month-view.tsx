"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildMonthGrid,
  dayOfWeekOrder,
  weekdayLabel,
  type WeekStart,
} from "@/lib/calendar-grid/month-grid";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { OhCard } from "@/components/oh/oh-card";
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
  /** Cmd+click parity (B.PT142) — chips become `<a href>` so power
   *  users open the standalone /bookings/<uid> page in a new tab. */
  getHref?: (event: CalendarEvent) => string;
  /** Called when a busy day's "+N MORE" overflow is clicked. Caller
   *  typically navigates to the Day view for that date. */
  onOverflowClick?: (date: Date, events: CalendarEvent[]) => void;
  /** Optional href for the +N MORE overflow link (cmd-click parity).
   *  Caller typically passes a `?view=day&date=YYYY-MM-DD` URL. */
  getOverflowHref?: (date: Date) => string;
  /** CSS max-height. Default `calc(100dvh - 280px)` (viewport-
   *  relative). Pass `"none"` to opt out. (B.PT143.) */
  maxBodyHeight?: string;
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
  getHref,
  onOverflowClick,
  getOverflowHref,
  maxBodyHeight = "calc(100dvh - 280px)",
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

  // Scroll container (B.PT142, refined B.PT143). Default uses
  // `calc(100dvh - 280px)` so the month grid fills viewport height
  // on tall screens (a 5-row month at 110px/row would only need
  // ~600px tall, but on a 1080p screen we have 800px+ available;
  // letting the cells grow makes them readable for chip lists +
  // gives breathing room).
  const isCapped = maxBodyHeight !== "none";
  // B.PT304 — `"100%"` switches to fit-parent mode (flex-1 min-h-0)
  // so the view shares vertical space with sibling chrome above
  // rather than running max-height: 100% which doesn't share.
  const isFitParent = maxBodyHeight === "100%";
  const wrapperStyle =
    isCapped && !isFitParent ? { maxHeight: maxBodyHeight } : undefined;

  // Region label for screen readers (B.PT145). Announces "Month view
  // for May 2026" on focus, giving SR users context for the grid.
  const monthLabel = date
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <OhCard
      role="region"
      aria-label={`Month view for ${monthLabel}`}
      // tabIndex=0 makes the scrollable region keyboard-accessible
      // (B.PT149, axe rule scrollable-region-focusable).
      tabIndex={isCapped ? 0 : undefined}
      // B.PT308 — switched manual `rounded + shadow-resting` string
      // to <OhCard>, the project's depth-chrome primitive. Same
      // visual result, single source of truth across workspaces /
      // event-types / booking-horizon chips / now the month grid.
      // Inner grid hairlines (the 7-col weekday header, day-cell
      // borders, week separators) are STRUCTURAL — they communicate
      // "month grid" not "card edge" — kept verbatim EXCEPT the
      // ones that touch the wall:
      //   • Day grid's `border-l` (was redundant with card's left edge)
      //   • Rightmost column's `border-r` on every 7th cell
      //   • Bottom row's `border-b` on the last 7 cells
      // Suppressed via grid-level `[&>:nth-child(7n)]:border-r-0` +
      // `[&>:nth-last-child(-n+7)]:border-b-0` arbitrary selectors,
      // so the card's rounded edge owns the outer bounds without
      // visible hairlines bumping into the corner radius.
      className={cn(
        "flex flex-col overflow-hidden",
        isCapped && "overflow-y-auto",
        isFitParent && "min-h-0 flex-1",
      )}
      style={wrapperStyle}
    >
      {/* Weekday header row — sticky on scroll */}
      <div
        className="sticky top-0 z-20 grid border-b border-oh-line bg-[color:var(--oh-paper)]"
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

      {/* Day grid — inner hairlines only. The 4 wall-touching edges
          (left, right, bottom; top is owned by the weekday-header
          border-b above) are suppressed via the nth-child + nth-last-
          child selectors on this grid so the card's rounded outline
          marks the bounds cleanly. */}
      <div
        className="grid [&>:nth-child(7n)]:border-r-0 [&>:nth-last-child(-n+7)]:border-b-0"
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
            getHref={getHref}
            onOverflowClick={onOverflowClick}
            getOverflowHref={getOverflowHref}
          />
        ))}
      </div>
    </OhCard>
  );
}
