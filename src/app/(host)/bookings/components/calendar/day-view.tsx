"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

export type DayViewProps = {
  date: Date;
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  oneMinuteHeightPx?: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
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

  const isCapped = maxBodyHeight !== "none";
  const bodyStyle = isCapped ? { maxHeight: maxBodyHeight } : undefined;

  return (
    <div
      className={cn(
        "flex flex-col rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        isCapped && "overflow-y-auto",
      )}
      style={bodyStyle}
    >
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
