"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

// Week mode — 7-column time grid Mon–Sun.
//
// Layout: `[hour-axis 56px] [day1 1fr] … [day7 1fr]` with a single
// shared HourAxis on the left and seven `<TimeGridColumn>`s. Today's
// column gets a subtle ink-tint background per the design's intent.
//
// Default scale: same as Day view (oneMinuteHeightPx = 1). The week
// columns share the same vertical scale as the day view so the user's
// muscle memory carries between modes — same hour at same y.

export type WeekViewProps = {
  /** Any date inside the week to render. The view normalizes to
   *  Monday of that week. */
  date: Date;
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  oneMinuteHeightPx?: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
  /** CSS max-height for the body. Default = `calc(100dvh - 280px)`
   *  (viewport-relative). Pass `"none"` to opt out. (B.PT143 —
   *  was a fixed 640px.) */
  maxBodyHeight?: string;
  /** Min body width. Below this the body horizontally scrolls
   *  inside the wrapper so chips stay readable on narrow viewports
   *  (cal.com pattern: their inner is `width: 165%` to force the
   *  same scroll). Default 1100px (B.PT143 — bumped from 980 to
   *  give 7 columns ~157px each, much more comfortable). */
  minBodyWidthPx?: number;
  nowOverride?: Date;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  const offset = day === 0 ? -6 : 1 - day; // map to Monday
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + offset);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function formatDayHeader(d: Date): { weekday: string; ordinal: string } {
  return {
    weekday: d
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase(),
    ordinal: String(d.getDate()),
  };
}

export function WeekView({
  date,
  events,
  startHour = 7,
  endHour = 20,
  oneMinuteHeightPx = 1,
  selectedRefId = null,
  onEventClick,
  getHref,
  maxBodyHeight = "calc(100dvh - 280px)",
  minBodyWidthPx = 1100,
  nowOverride,
}: WeekViewProps) {
  const monday = useMemo(() => startOfWeekMonday(date), [date]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );

  // Pre-filter events into per-day buckets so each TimeGridColumn
  // receives only its day's events. One pass over events per render
  // (cheap up to several hundred events).
  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of days) {
      const k = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      map.set(k, []);
    }
    for (const e of events) {
      const k = `${e.start.getFullYear()}-${e.start.getMonth()}-${e.start.getDate()}`;
      const bucket = map.get(k);
      if (bucket) bucket.push(e);
    }
    return map;
  }, [events, days]);

  const today = nowOverride ?? new Date();

  // Scroll container (B.PT142, refined B.PT143). Two scroll axes:
  //   - vertical: max-height + overflow-y-auto + sticky day-headers.
  //               Default = `calc(100dvh - 280px)` so the calendar
  //               fills available viewport height on tall screens.
  //   - horizontal: min-width on the inner body forces overflow-x
  //                 when the wrapper is narrower than minBodyWidthPx.
  //                 Default = 1100px (gives 7 columns ~157px each).
  //                 Cal.com uses the same pattern (width: 165% on
  //                 their inner div in Calendar.tsx).
  const isCapped = maxBodyHeight !== "none";
  const wrapperStyle = isCapped ? { maxHeight: maxBodyHeight } : undefined;
  const innerStyle =
    minBodyWidthPx > 0 ? { minWidth: `${minBodyWidthPx}px` } : undefined;

  return (
    <div
      className={cn(
        "rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        isCapped && "overflow-y-auto",
        minBodyWidthPx > 0 && "overflow-x-auto",
      )}
      style={wrapperStyle}
    >
      <div className="flex flex-col" style={innerStyle}>
        {/* Day headers row — sticky on vertical scroll. Paper bg so
            chips scrolling under don't bleed. The hour-axis spacer
            cell is also sticky-left so the headers align with the
            stickied axis on horizontal scroll. */}
        <div className="sticky top-0 z-30 border-b border-oh-line bg-[color:var(--oh-paper)]">
          <div className="flex">
            <div
              className="sticky left-0 z-10 w-14 shrink-0 bg-[color:var(--oh-paper)]"
              aria-hidden
            />
            {days.map((d) => {
              const isToday = isSameDay(d, today);
              const { weekday, ordinal } = formatDayHeader(d);
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-1 flex-col items-center gap-1 pb-3 pt-3"
                >
                  <span className="oh-eyebrow opacity-100">{weekday}</span>
                  <span
                    className={cn(
                      "font-sans text-[16px] font-bold leading-none tracking-tight",
                      isToday &&
                        "inline-flex size-6 items-center justify-center rounded-full bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)]",
                    )}
                  >
                    {ordinal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body — hour axis + 7 time-grid columns. The HourAxis is
            wrapped in a sticky-left container so it stays visible on
            horizontal scroll. Paper bg + z-10 so chips can't overlap
            on top during scroll. */}
        <div className="relative flex pt-2">
          <div className="sticky left-0 z-10 bg-[color:var(--oh-paper)]">
            <HourAxis
              startHour={startHour}
              endHour={endHour}
              oneMinuteHeightPx={oneMinuteHeightPx}
            />
          </div>
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dayEvents = eventsByDayKey.get(k) ?? [];
            return (
              <TimeGridColumn
                key={d.toISOString()}
                date={d}
                events={dayEvents}
                startHour={startHour}
                endHour={endHour}
                oneMinuteHeightPx={oneMinuteHeightPx}
                selectedRefId={selectedRefId}
                onEventClick={onEventClick}
                getHref={getHref}
                showCurrentTimeLine={isToday}
                nowOverride={nowOverride}
                className={cn(
                  "border-l border-oh-line",
                  // Today's column gets a subtle ink-tint background.
                  isToday && "bg-[color:var(--oh-tint)]",
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
