"use client";

import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

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
  isToday: boolean;
  isInMonth: boolean;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  getHref?: (event: CalendarEvent) => string;
  onOverflowClick?: (date: Date, events: CalendarEvent[]) => void;
  getOverflowHref?: (date: Date) => string;
};

export function MonthDayCell({
  date,
  events,
  isToday,
  isInMonth,
  selectedRefId = null,
  onEventClick,
  getHref,
  onOverflowClick,
  getOverflowHref,
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
        !isInMonth && "opacity-40",
        isToday && "bg-[color:var(--oh-tint)]",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-current={isToday ? "date" : undefined}
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

      <div className="flex flex-col gap-0.5">
        {visibleEvents.map((event) => {
          const href = getHref ? getHref(event) : undefined;
          const Component: "a" | "button" = href ? "a" : "button";
          const handleClick = (e: React.MouseEvent) => {
            if (!onEventClick) return;
            if (Component === "a") {
              if (
                e.defaultPrevented ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              e.preventDefault();
            }
            onEventClick(event);
          };
          return (
          <Component
            key={event.id}
            type={Component === "button" ? "button" : undefined}
            href={Component === "a" ? href : undefined}
            data-event-id={event.id}
            data-status={event.status}
            onClick={onEventClick ? handleClick : undefined}
            aria-label={`${event.title} at ${formatChipTime(event.start)} — ${event.status}`}
            className={cn(
              "flex w-full items-center gap-1 truncate text-left",
              "rounded-(--oh-r-xs) px-1 py-0.5 cursor-pointer",
              "hover:bg-[color:var(--oh-tint)] transition-colors duration-150 ease-oh",
              event.refId === selectedRefId &&
                "ring-1 ring-[color:var(--oh-ink)]",
              event.status === "cancelled" && "opacity-65 line-through",
            )}
          >
            <span
              aria-hidden
              className="inline-block size-1.5 shrink-0 rounded-full"
              style={
                event.status === "tentative"
                  ? {
                      background: "transparent",
                      border: `1px solid var(--oh-status-${event.status})`,
                    }
                  : { background: `var(--oh-status-${event.status})` }
              }
            />
            <span className="font-mono text-[10px] leading-none tabular-nums opacity-65">
              {formatChipTime(event.start)}
            </span>
            <span className="truncate font-sans text-[11px] font-bold leading-none">
              {event.title}
            </span>
          </Component>
          );
        })}
        {overflowCount > 0 ? (() => {
          const overflowHref = getOverflowHref ? getOverflowHref(date) : undefined;
          const OverflowComponent: "a" | "button" = overflowHref
            ? "a"
            : "button";
          const handleOverflowClick = (e: React.MouseEvent) => {
            if (!onOverflowClick) return;
            if (OverflowComponent === "a") {
              if (
                e.defaultPrevented ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              e.preventDefault();
            }
            onOverflowClick(date, sortedEvents);
          };
          return (
            <OverflowComponent
              type={OverflowComponent === "button" ? "button" : undefined}
              href={OverflowComponent === "a" ? overflowHref : undefined}
              onClick={
                onOverflowClick ? handleOverflowClick : undefined
              }
              aria-label={`Show all ${sortedEvents.length} bookings on ${date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`}
              className={cn(
                "oh-eyebrow text-left opacity-55 hover:opacity-100",
                "px-1 py-0.5 cursor-pointer transition-opacity duration-200",
              )}
            >
              +{overflowCount} more
            </OverflowComponent>
          );
        })() : null}
      </div>
    </div>
  );
}
