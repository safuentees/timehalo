"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

export type WeekViewProps = {
  date: Date;
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  oneMinuteHeightPx?: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
  maxBodyHeightPx?: number;
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
  maxBodyHeightPx = 640,
  minBodyWidthPx = 980,
  nowOverride,
}: WeekViewProps) {
  const monday = useMemo(() => startOfWeekMonday(date), [date]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );

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

  const wrapperStyle = maxBodyHeightPx > 0
    ? { maxHeight: `${maxBodyHeightPx}px` }
    : undefined;
  const innerStyle =
    minBodyWidthPx > 0 ? { minWidth: `${minBodyWidthPx}px` } : undefined;

  return (
    <div
      className={cn(
        "rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        maxBodyHeightPx > 0 && "overflow-y-auto",
        minBodyWidthPx > 0 && "overflow-x-auto",
      )}
      style={wrapperStyle}
    >
      <div className="flex flex-col" style={innerStyle}>
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
