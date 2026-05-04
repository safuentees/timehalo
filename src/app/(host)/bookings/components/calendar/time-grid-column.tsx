"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  calculateEventLayouts,
  createLayoutMap,
} from "@/lib/calendar-grid/overlap";
import { eventToGridPosition } from "@/lib/calendar-grid/event-geometry";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { useCurrentMinute } from "@/lib/calendar-grid/use-current-minute";
import { EventChip } from "./event-chip";

export type TimeGridColumnProps = {
  date: Date;
  events: CalendarEvent[];
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
  showCurrentTimeLine?: boolean;
  nowOverride?: Date;
  className?: string;
};

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function TimeGridColumn({
  date,
  events,
  startHour,
  endHour,
  oneMinuteHeightPx,
  selectedRefId = null,
  onEventClick,
  getHref,
  showCurrentTimeLine = false,
  nowOverride,
  className,
}: TimeGridColumnProps) {
  const tickedNow = useCurrentMinute();
  const now = nowOverride ?? tickedNow;

  const totalMinutes = (endHour - startHour + 1) * 60;
  const columnHeightPx = totalMinutes * oneMinuteHeightPx;

  const layouts = useMemo(
    () => calculateEventLayouts(events),
    [events],
  );
  const layoutMap = useMemo(() => createLayoutMap(layouts), [layouts]);

  const hourRules: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hourRules.push((h - startHour) * 60 * oneMinuteHeightPx);
  }

  const currentTimeLineTop = (() => {
    if (!showCurrentTimeLine) return null;
    if (!isSameDay(now, date)) return null;
    const minutesFromStart =
      (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromStart < 0 || minutesFromStart > totalMinutes) return null;
    return minutesFromStart * oneMinuteHeightPx;
  })();

  return (
    <div
      className={cn("relative flex-1 min-w-0", className)}
      style={{ height: `${columnHeightPx}px` }}
    >
      {hourRules.map((top, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute left-0 right-0 h-px bg-oh-line"
          style={{ top: `${top}px` }}
        />
      ))}

      {events.map((event) => {
        const layout = layoutMap.get(event.id);
        if (!layout) return null;

        const pos = eventToGridPosition(event, {
          startHour,
          endHour,
          oneMinuteHeightPx,
        });
        if (!pos.isVisible) return null;

        const isSelected =
          selectedRefId !== null && event.refId === selectedRefId;
        const href = getHref ? getHref(event) : undefined;

        return (
          <div
            key={event.id}
            className="absolute"
            style={{
              top: `${pos.top}px`,
              height: `${pos.height}px`,
              left: `${layout.leftOffsetPercent}%`,
              width: `${layout.widthPercent}%`,
              zIndex: isSelected ? 79 : layout.baseZIndex,
            }}
          >
            <EventChip
              event={event}
              isSelected={isSelected}
              onClick={onEventClick}
              href={href}
            />
          </div>
        );
      })}

      {currentTimeLineTop !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 z-[80]"
          style={{ top: `${currentTimeLineTop}px` }}
        >
          <span className="absolute left-0 right-0 top-0 h-px bg-[color:var(--oh-status-confirmed)]" />
          <span
            className="absolute -left-1 -top-1 size-2 rounded-full bg-[color:var(--oh-status-confirmed)]"
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}
