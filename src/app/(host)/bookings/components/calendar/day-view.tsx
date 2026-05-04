"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

// Day mode — single-column time grid.
//
// Layout: `[hour-axis 56px] [day-column 1fr]`. Day header reads the
// full weekday + date in the dashboard's mono-caps voice. Today's
// header gets the inverse-circle treatment to match the design's
// month-cell pattern.
//
// Default scale: oneMinuteHeightPx = 1 (= 60px per hour, matching
// cal.com's --one-minute-height: 1px default). Tight enough that
// 7am-8pm fits in ~840px; loose enough that 30-min chips have room
// for two-line content.

export type DayViewProps = {
  date: Date;
  events: CalendarEvent[];
  /** First hour rendered. Default 7 (7am). */
  startHour?: number;
  /** Last hour rendered, inclusive. Default 20 (8pm). */
  endHour?: number;
  /** Pixels per minute. Default 1 (60px per hour). */
  oneMinuteHeightPx?: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** Cmd+click parity (B.PT142) — chips become `<a href>` so power
   *  users open the standalone /bookings/<uid> page in a new tab. */
  getHref?: (event: CalendarEvent) => string;
  /** CSS max-height for the body. Default uses viewport-relative
   *  `calc(100dvh - 280px)` so the calendar fills the available
   *  vertical space on tall screens (B.PT143 — was a fixed 640px,
   *  which wasted ~30% of pixel real estate on a 1080p display).
   *  Pass `"none"` to opt out of any cap (playground / Storybook). */
  maxBodyHeight?: string;
  nowOverride?: Date;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatHeaderDate(date: Date): { weekday: string; ordinal: string } {
  const weekday = date
    .toLocaleDateString("en-US", { weekday: "long" })
    .toUpperCase();
  const ordinal = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return { weekday, ordinal: ordinal.toUpperCase() };
}

export function DayView({
  date,
  events,
  startHour = 7,
  endHour = 20,
  oneMinuteHeightPx = 1,
  selectedRefId = null,
  onEventClick,
  getHref,
  maxBodyHeight = "calc(100dvh - 280px)",
  nowOverride,
}: DayViewProps) {
  const { weekday, ordinal } = formatHeaderDate(date);

  const dayEvents = useMemo(
    () => events.filter((e) => isSameDay(e.start, date)),
    [events, date],
  );

  const isToday = (() => {
    const now = nowOverride ?? new Date();
    return isSameDay(now, date);
  })();

  // Scroll container. When `maxBodyHeight !== "none"`, the body is
  // capped + scrollable; sticky day-header stays at top. Default
  // uses viewport-relative `calc(100dvh - 280px)` (B.PT143 — was a
  // fixed 640px which under-used tall screens). Playground passes
  // `"none"` so the visual regression baseline captures full height.
  const isCapped = maxBodyHeight !== "none";
  const bodyStyle = isCapped ? { maxHeight: maxBodyHeight } : undefined;

  // Region label for screen readers (B.PT145). "Day view for Mon
  // May 4" gives SR users context when they focus into the grid.
  const dayLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      role="region"
      aria-label={`Day view for ${dayLabel}`}
      // tabIndex=0 makes the scrollable region keyboard-focusable so
      // users can scroll the calendar with arrow keys (B.PT149 —
      // axe rule scrollable-region-focusable). When the body is not
      // capped (playground), no scroll, no need.
      tabIndex={isCapped ? 0 : undefined}
      className={cn(
        "flex flex-col rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        isCapped && "overflow-y-auto",
      )}
      style={bodyStyle}
    >
      {/* Day header — sticky on scroll, hairline rule below.
          Paper bg so events scrolling under don't bleed through. */}
      <div className="sticky top-0 z-20 border-b border-oh-line bg-[color:var(--oh-paper)]">
        <div className="flex items-baseline gap-3 pb-3 pl-14 pt-3">
          <span
            className={cn(
              "oh-eyebrow opacity-100",
              isToday && "font-extrabold",
            )}
          >
            {weekday}
          </span>
          <span
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "font-sans text-[20px] font-bold leading-none tracking-tight",
              isToday &&
                "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[color:var(--oh-ink)] px-1.5 text-[color:var(--oh-paper)]",
            )}
          >
            {ordinal}
          </span>
        </div>
      </div>

      {/* Body — hour axis + single time-grid column */}
      <div className="relative flex pt-2">
        <HourAxis
          startHour={startHour}
          endHour={endHour}
          oneMinuteHeightPx={oneMinuteHeightPx}
        />
        <TimeGridColumn
          date={date}
          events={dayEvents}
          startHour={startHour}
          endHour={endHour}
          oneMinuteHeightPx={oneMinuteHeightPx}
          selectedRefId={selectedRefId}
          onEventClick={onEventClick}
          getHref={getHref}
          showCurrentTimeLine={isToday}
          nowOverride={nowOverride}
          className="border-l border-oh-line pl-2"
        />
      </div>
    </div>
  );
}
