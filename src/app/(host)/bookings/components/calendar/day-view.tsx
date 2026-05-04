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

  return (
    <div className="flex flex-col">
      {/* Day header — hairline rule below */}
      <div className="border-b border-oh-line">
        <div className="flex items-baseline gap-3 pb-3 pl-14">
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
          showCurrentTimeLine={isToday}
          nowOverride={nowOverride}
          className="border-l border-oh-line pl-2"
        />
      </div>
    </div>
  );
}
