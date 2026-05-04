"use client";

import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

// One cell of the Month grid.
//
// Layout:
//   ┌────────────────────────────┐
//   │ 12·                    [3]│   date number + count badge
//   │ 09a Greta — 30m           │   chip 1
//   │ 10a Owen — 30m            │   chip 2
//   │ 02p Marcus — 15m          │   chip 3
//   │ +N MORE                   │   overflow row (when >3)
//   └────────────────────────────┘
//
// Today's cell gets the inverse-circle treatment on the date number.
// Out-of-month cells dim to ~40% opacity. Click on a chip → onEventClick;
// click on the overflow → onOverflowClick (parent opens a popover with
// every booking that day).

const MAX_VISIBLE_CHIPS = 3;

function formatChipTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "P" : "A";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${h12}${ampm}`;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

export type MonthDayCellProps = {
  date: Date;
  events: CalendarEvent[];
  /** True if this cell's date matches the current "today". Caller
   *  uses a single `now` snapshot for all 35/42 cells. */
  isToday: boolean;
  /** True if the date is inside the requested month (vs. leading/
   *  trailing fill). */
  isInMonth: boolean;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  onOverflowClick?: (date: Date, events: CalendarEvent[]) => void;
};

export function MonthDayCell({
  date,
  events,
  isToday,
  isInMonth,
  selectedRefId = null,
  onEventClick,
  onOverflowClick,
}: MonthDayCellProps) {
  const sortedEvents = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const visibleEvents = sortedEvents.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = Math.max(0, sortedEvents.length - MAX_VISIBLE_CHIPS);

  return (
    <div
      data-in-month={isInMonth}
      className={cn(
        "relative flex flex-col gap-1 px-1.5 py-1 min-h-[112px]",
        "border-r border-b border-oh-line",
        // Out-of-month cells: dim. Today cell: subtle ink-tint bg.
        !isInMonth && "opacity-40",
        isToday && "bg-[color:var(--oh-tint)]",
      )}
    >
      {/* Date corner: number + (optional) count badge. Today gets
          the inverse-circle pill on the date. Count badge appears
          when ≥1 event. */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-[12px] font-bold leading-none tabular-nums",
            isToday &&
              "inline-flex size-5 items-center justify-center rounded-full bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)]",
          )}
        >
          {date.getDate()}
        </span>
        {sortedEvents.length > 0 ? (
          <span className="oh-eyebrow tabular-nums opacity-55">
            {sortedEvents.length}
          </span>
        ) : null}
      </div>

      {/* Chips — up to MAX_VISIBLE_CHIPS, then a "+N MORE" overflow */}
      <div className="flex flex-col gap-0.5">
        {visibleEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            data-event-id={event.id}
            onClick={onEventClick ? () => onEventClick(event) : undefined}
            aria-label={`${event.title} at ${formatChipTime(event.start)}`}
            className={cn(
              "flex w-full items-center gap-1 truncate text-left",
              "rounded-(--oh-r-xs) px-1 py-0.5 cursor-pointer",
              "hover:bg-[color:var(--oh-tint)] transition-colors duration-150 ease-oh",
              event.refId === selectedRefId &&
                "ring-1 ring-[color:var(--oh-ink)]",
              event.status === "cancelled" && "opacity-65 line-through",
            )}
          >
            {/* Status dot — 6px solid color */}
            <span
              aria-hidden
              className="inline-block size-1.5 shrink-0 rounded-full"
              style={{ background: `var(--oh-status-${event.status})` }}
            />
            <span className="font-mono text-[10px] leading-none tabular-nums opacity-65">
              {formatChipTime(event.start)}
            </span>
            <span className="truncate font-sans text-[11px] font-bold leading-none">
              {event.title}
            </span>
          </button>
        ))}
        {overflowCount > 0 ? (
          <button
            type="button"
            onClick={
              onOverflowClick
                ? () => onOverflowClick(date, sortedEvents)
                : undefined
            }
            className={cn(
              "oh-eyebrow text-left opacity-55 hover:opacity-100",
              "px-1 py-0.5 cursor-pointer transition-opacity duration-200",
            )}
          >
            +{overflowCount} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
