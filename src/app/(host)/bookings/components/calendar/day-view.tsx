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
  /** Max body height. Above this the time-grid scrolls internally
   *  with a sticky header. Default 640px. Pass 0 to opt out
   *  (playground / Storybook). */
  maxBodyHeightPx?: number;
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
  maxBodyHeightPx = 640,
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

  // Scroll container (B.PT142). When `maxBodyHeightPx > 0`, the
  // body is capped + scrollable; sticky day-header stays at top.
  // When 0 (playground), no cap so the visual regression baseline
  // captures the full height for snapshotting.
  const bodyStyle = maxBodyHeightPx > 0
    ? { maxHeight: `${maxBodyHeightPx}px` }
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        maxBodyHeightPx > 0 && "overflow-y-auto",
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
