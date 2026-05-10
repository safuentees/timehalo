"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

const SCROLL_TARGET_HOUR_DEFAULT = 8;

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
  startHour = 0,
  endHour = 23,
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
  const isFitParent = maxBodyHeight === "100%";
  const bodyStyle =
    isCapped && !isFitParent ? { maxHeight: maxBodyHeight } : undefined;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  useEffect(() => {
    if (!isCapped) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const now = nowOverride ?? new Date();
    const isShowingToday = isSameDay(now, date);
    const targetHour = isShowingToday
      ? now.getHours() + now.getMinutes() / 60
      : SCROLL_TARGET_HOUR_DEFAULT;
    const targetMinutesFromStart = (targetHour - startHour) * 60;
    const targetPx = targetMinutesFromStart * oneMinuteHeightPx;
    const desiredScroll = targetPx - wrapper.clientHeight / 2;
    wrapper.scrollTop = Math.max(0, desiredScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, startHour, oneMinuteHeightPx, isCapped]);

  const dayLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label={`Day view for ${dayLabel}`}
      tabIndex={isCapped ? 0 : undefined}
      className={cn(
        "flex flex-col rounded-(--oh-r-sm) bg-[color:var(--oh-paper)]",
        "shadow-[var(--oh-shadow-resting)]",
        isCapped && "overflow-y-auto",
        isFitParent && "min-h-0 flex-1",
      )}
      style={bodyStyle}
    >
      <div className="sticky top-0 z-20 border-b border-oh-line bg-[color:var(--oh-paper)]">
        <p
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "oh-eyebrow flex items-center gap-2 py-3 pl-14",
            isToday ? "opacity-100" : "opacity-65",
          )}
        >
          <span>{ordinal}</span>
          {isToday ? (
            <span
              aria-hidden
              className="block size-1 rounded-full bg-[color:var(--oh-status-confirmed)]"
            />
          ) : null}
        </p>
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
