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

function formatTimeRange(event: CalendarEvent): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  return `${fmt(event.start)} – ${fmt(event.end)}`;
}

export function EventChip({
  event,
  isSelected = false,
  isHovered = false,
  onClick,
}: {
  event: CalendarEvent;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: (event: CalendarEvent) => void;
}) {
  const dur = durationMinutes(event);
  const display = chooseDisplay(dur);

  const Component = onClick ? "button" : "div";

  const statusVar = `var(--oh-status-${event.status})`;

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick ? () => onClick(event) : undefined}
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
        style={{ background: statusVar }}
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
            <span className="font-mono text-[10px] leading-none opacity-55 tabular-nums">
              {formatTimeRange(event)}
            </span>
          </>
        ) : (
          <>
            <span className="truncate font-sans text-[12px] font-bold leading-tight">
              {event.title}
            </span>
            <span className="font-mono text-[10px] leading-none opacity-55 tabular-nums">
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
