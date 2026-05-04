"use client";

import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

type DisplayType = "single-line" | "multi-line" | "full";

function durationMinutes(event: CalendarEvent): number {
  return Math.max(0, (event.end.getTime() - event.start.getTime()) / 60_000);
}

function chooseDisplay(eventDuration: number): DisplayType {
  if (eventDuration < 40) return "single-line";
  if (eventDuration < 45) return "multi-line";
  return "full";
}

export function formatTimeRange(event: CalendarEvent): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  const start = fmt(event.start);
  const end = fmt(event.end);

  const periodRe = /\s(am|pm)$/i;
  const startMatch = start.match(periodRe);
  const endMatch = end.match(periodRe);

  if (!startMatch || !endMatch) return `${start} – ${end}`;

  if (startMatch[1].toLowerCase() === endMatch[1].toLowerCase()) {
    return `${start.replace(periodRe, "")} – ${end}`;
  }

  return `${start} – ${end}`;
}

export function EventChip({
  event,
  isSelected = false,
  isHovered = false,
  onClick,
  href,
}: {
  event: CalendarEvent;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: (event: CalendarEvent) => void;
  href?: string;
}) {
  const dur = durationMinutes(event);
  const display = chooseDisplay(dur);

  const Component: "a" | "button" | "div" =
    href ? "a" : onClick ? "button" : "div";

  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
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
    onClick(event);
  };

  const statusVar = `var(--oh-status-${event.status})`;

  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      href={Component === "a" ? href : undefined}
      onClick={onClick ? handleClick : undefined}
      data-event-id={event.id}
      data-status={event.status}
      aria-label={`${event.title} — ${formatTimeRange(event)} — ${event.status}`}
      className={cn(
        "group/chip relative flex h-full w-full overflow-hidden cursor-pointer",
        "rounded-(--oh-r-xs) text-left",
        "transition-colors duration-150 ease-oh",
        "bg-[color:color-mix(in_srgb,var(--oh-paper)_70%,white)]",
        "hover:bg-[color:var(--oh-tint)]",
        event.status === "cancelled" &&
          "border border-dashed border-[color:var(--oh-line)] opacity-65 line-through",
        (isSelected || isHovered) && "ring-2 ring-[color:var(--oh-ink)]",
      )}
    >
      <span
        aria-hidden
        className="block h-full w-[3px] shrink-0"
        style={
          event.status === "tentative"
            ? {
                backgroundImage: `repeating-linear-gradient(to bottom, ${statusVar} 0 4px, transparent 4px 8px)`,
              }
            : { background: statusVar }
        }
      />

      <span
        className={cn(
          "flex w-full min-w-0 px-1.5",
          display === "single-line"
            ? "items-center gap-2"
            : "flex-col py-1 gap-0.5",
        )}
      >
        {display === "single-line" ? (
          <>
            <span className="truncate font-sans text-[12px] font-bold leading-none">
              {event.title}
            </span>
            <span className="whitespace-nowrap font-mono text-[10px] leading-none opacity-55 tabular-nums">
              {formatTimeRange(event)}
            </span>
          </>
        ) : (
          <>
            <span className="truncate font-sans text-[12px] font-bold leading-tight">
              {event.title}
            </span>
            <span className="truncate whitespace-nowrap font-mono text-[10px] leading-none opacity-55 tabular-nums">
              {formatTimeRange(event)}
            </span>
            {display === "full" && event.subtitle ? (
              <span className="truncate font-sans text-[11px] leading-tight opacity-65">
                {event.subtitle}
              </span>
            ) : null}
          </>
        )}
      </span>
    </Component>
  );
}
