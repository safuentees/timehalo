"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
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
  maxBodyHeight?: string;
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

function formatDayHeader(
  d: Date,
  locale: string,
): { weekday: string; ordinal: string } {
  return {
    weekday: d
      .toLocaleDateString(locale, { weekday: "short" })
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
  const locale = useLocale();
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

  const isCapped = maxBodyHeight !== "none";
  const wrapperStyle = isCapped ? { maxHeight: maxBodyHeight } : undefined;
  const innerStyle =
    minBodyWidthPx > 0 ? { minWidth: `${minBodyWidthPx}px` } : undefined;

  const sunday = days[6];
  const weekLabel = (() => {
    const startMonth = monday.toLocaleDateString(locale, { month: "short" });
    const endMonth = sunday.toLocaleDateString(locale, { month: "short" });
    if (startMonth === endMonth) {
      return `${startMonth} ${monday.getDate()}-${sunday.getDate()}, ${sunday.getFullYear()}`;
    }
    return `${startMonth} ${monday.getDate()} - ${endMonth} ${sunday.getDate()}, ${sunday.getFullYear()}`;
  })();

  return (
    <div
      role="region"
      aria-label={`Week view for ${weekLabel}`}
      tabIndex={isCapped || minBodyWidthPx > 0 ? 0 : undefined}
      className={cn(
        "rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)]",
        isCapped && "overflow-y-auto",
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
              const { weekday, ordinal } = formatDayHeader(d, locale);
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-1 flex-col items-center gap-1 pb-3 pt-3"
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
