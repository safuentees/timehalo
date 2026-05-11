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

export type MonthViewProps = {
  date: Date;
  events: CalendarEvent[];
  weekStartsOn?: WeekStart;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
  onOverflowClick?: (date: Date, events: CalendarEvent[]) => void;
  getOverflowHref?: (date: Date) => string;
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

  const isCapped = maxBodyHeight !== "none";
  const isFitParent = maxBodyHeight === "100%";
  const wrapperStyle =
    isCapped && !isFitParent ? { maxHeight: maxBodyHeight } : undefined;

  const monthLabel = date
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <OhCard
      role="region"
      aria-label={`Month view for ${monthLabel}`}
      tabIndex={isCapped ? 0 : undefined}
      className={cn(
        "flex flex-col overflow-hidden",
        isCapped && "overflow-y-auto",
        isFitParent && "min-h-0 flex-1",
      )}
      style={wrapperStyle}
    >
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
