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

  return (
    <div className="flex flex-col">
      {/* Day headers row — hairline rule below */}
      <div className="border-b border-oh-line">
        <div className="flex">
          <div className="w-14 shrink-0" /> {/* spacer for hour axis */}
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            const { weekday, ordinal } = formatDayHeader(d);
            return (
              <div
                key={d.toISOString()}
                className="flex flex-1 flex-col items-center gap-1 pb-3 pt-1"
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

      {/* Body — hour axis + 7 time-grid columns */}
      <div className="relative flex pt-2">
        <HourAxis
          startHour={startHour}
          endHour={endHour}
          oneMinuteHeightPx={oneMinuteHeightPx}
        />
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
  );
}
