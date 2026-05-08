"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

// Scroll target hour when the displayed week does NOT contain today
// (no "current time" anchor). 8am roughly matches the booking-flow
// working-hours assumption + cal.com's behavior.
const SCROLL_TARGET_HOUR_DEFAULT = 8;

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
  startHour = 0,
  endHour = 23,
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

  // Auto-scroll to a meaningful hour on cursor change (B.PT292).
  // Mirrors `day-view.tsx` — cal.com's pattern of starting at the
  // current time when today is in view, falling back to 8am when
  // navigating to other weeks. Without this, the 0-23 grid would
  // paint at midnight by default. `mondayKey` (YYYY-MM-DD) gates
  // re-runs to actual week changes.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const todayInThisWeek = days.some((d) => isSameDay(d, today));
  const mondayKey = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
  useEffect(() => {
    if (!isCapped) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const targetHour = todayInThisWeek
      ? today.getHours() + today.getMinutes() / 60
      : SCROLL_TARGET_HOUR_DEFAULT;
    const targetMinutesFromStart = (targetHour - startHour) * 60;
    const targetPx = targetMinutesFromStart * oneMinuteHeightPx;
    const desiredScroll = targetPx - wrapper.clientHeight / 2;
    wrapper.scrollTop = Math.max(0, desiredScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mondayKey, startHour, oneMinuteHeightPx, isCapped]);

  // Region label for screen readers (B.PT145). "Week view for May 4-10
  // 2026" tells SR users which week they're focused into. Reuses the
  // already-memoized `monday` from above; sunday derived locally.
  const sunday = days[6];
  const weekLabel = (() => {
    const startMonth = monday.toLocaleDateString("en-US", { month: "short" });
    const endMonth = sunday.toLocaleDateString("en-US", { month: "short" });
    if (startMonth === endMonth) {
      return `${startMonth} ${monday.getDate()}-${sunday.getDate()}, ${sunday.getFullYear()}`;
    }
    return `${startMonth} ${monday.getDate()} - ${endMonth} ${sunday.getDate()}, ${sunday.getFullYear()}`;
  })();

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label={`Week view for ${weekLabel}`}
      // tabIndex=0 — both vertical and horizontal scrolling on this
      // wrapper need keyboard access (B.PT149, axe rule
      // scrollable-region-focusable).
      tabIndex={isCapped || minBodyWidthPx > 0 ? 0 : undefined}
      className={cn(
        // B.PT290 — outer border replaced with drop shadow (canonical
        // `0 3px 12px rgba(0,0,0,0.22)`); inner grid hairlines (day
        // column borders, day-header bottom rule) kept as STRUCTURAL
        // separators because they communicate "7-column grid" not
        // "card edge."
        "rounded-(--oh-r-sm) bg-[color:var(--oh-paper)]",
        "shadow-[0_3px_12px_rgba(0,0,0,0.22)]",
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
          <div className="flex w-full">
            <div
              className="sticky left-0 z-10 w-14 shrink-0 bg-[color:var(--oh-paper)]"
              aria-hidden
            />
            {/* Each day cell takes an equal share via `flex-1 basis-0`
                (the basis-0 is what makes flex-1 distribute equally
                regardless of intrinsic content width). `min-w-0` lets
                the cell shrink below its content's natural width on
                narrow viewports without overflowing. Without basis-0,
                cells previously sized themselves to the content first
                ("MON 15" ≈ 30px each) and only divided remaining space
                — giving the visual "dates clumped together" feel the
                user reported. */}
            {days.map((d) => {
              const isToday = isSameDay(d, today);
              const { weekday, ordinal } = formatDayHeader(d);
              return (
                <div
                  key={d.toISOString()}
                  className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 pb-3 pt-3"
                >
                  <span className="oh-eyebrow opacity-100">{weekday}</span>
                  <span
                    aria-current={isToday ? "date" : undefined}
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
