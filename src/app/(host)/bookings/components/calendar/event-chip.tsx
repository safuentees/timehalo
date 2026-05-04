"use client";

import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

// Status-colored chip for the time-grid views.
//
// Adapted from cal.com (MIT) — `apps/web/modules/calendars/weeklyview/
// components/event/Event.tsx`. Adaptations:
//   - drops the cva variants in favor of explicit classNames per
//     status (project pattern; cva is fine but the project uses
//     `cn` + conditional strings throughout `bookings-list.tsx`)
//   - replaces cal.com's bg-subtle / hover:bg-emphasis Tailwind
//     tokens with our `--oh-status-*` tokens via inline style —
//     same "left color bar + tinted background" approach, project
//     palette
//   - displayType selection lifted verbatim: < 40min single-line,
//     < 45min multi-line, >= 45min full
//   - cmd+click parity (B.PT142) — when `href` is provided, the
//     chip renders as an `<a>` and modifier-clicks (cmd/ctrl/shift/
//     middle/alt) fall through to the href so power users open the
//     standalone /bookings/<uid> in a new tab. Plain left-click
//     calls `onClick` and does NOT navigate. Same pattern the list
//     rows use (B.PT138).
//
// The 3px-wide left color bar reads as a status indicator without
// flooding the chip with color — important for the dashboard's
// quiet visual identity. Shared chrome (border-radius, hover, focus)
// uses our oh-r-xs token + oh-tint hover.

type DisplayType = "single-line" | "multi-line" | "full";

function durationMinutes(event: CalendarEvent): number {
  return Math.max(0, (event.end.getTime() - event.start.getTime()) / 60_000);
}

function chooseDisplay(eventDuration: number): DisplayType {
  if (eventDuration < 40) return "single-line";
  if (eventDuration < 45) return "multi-line";
  return "full";
}

// Time-range formatter (B.PT151).
//
// Two narrow-column failure modes the previous "{start} – {end}"
// implementation hit in WeekView at <150px column widths:
//
//   1. Each timestamp emits "10:00 AM" — that internal space lets
//      browsers wrap "AM" to a second line when the chip body is
//      narrower than the full string. Wrap inflates chip height +
//      breaks the absolute-positioned overlap layout. Fix: see the
//      `whitespace-nowrap` on every time span in the render below.
//
//   2. The string was ~20 chars even when both endpoints shared a
//      period ("10:00 AM – 10:30 AM" — 19 chars + the en-dash). Most
//      bookings live entirely in AM or entirely in PM, so the first
//      "AM"/"PM" is redundant. Cal.com bypasses this by formatting in
//      24-hour ("10:00 – 10:30") which gives ~13 chars; we keep
//      locale-aware 12-hour (en-US default; Spanish locale already
//      emits 24-hour from toLocaleTimeString so this helper is a
//      no-op there) but drop the redundant marker when both endpoints
//      share a period — "10:00 – 10:30 AM" (16 chars). Crossing the
//      noon boundary keeps both markers ("11:30 AM – 12:30 PM").
//
// Locales without an AM/PM marker (Spanish default) return the
// unchanged "10:00 – 10:30" string — the suffix-stripping is a no-op
// when the format has no period marker to begin with.
export function formatTimeRange(event: CalendarEvent): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  const start = fmt(event.start);
  const end = fmt(event.end);

  // Extract the trailing " AM" / " PM" period marker if present
  // (case-insensitive — some locales emit lowercase "am"/"pm").
  const periodRe = /\s(am|pm)$/i;
  const startMatch = start.match(periodRe);
  const endMatch = end.match(periodRe);

  // No period markers → 24-hour locale; nothing to strip.
  if (!startMatch || !endMatch) return `${start} – ${end}`;

  // Both endpoints share the same period → drop the marker from the
  // start so only the end carries it ("10:00 – 10:30 AM").
  if (startMatch[1].toLowerCase() === endMatch[1].toLowerCase()) {
    return `${start.replace(periodRe, "")} – ${end}`;
  }

  // Crosses the noon boundary → keep both markers.
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
  /** When provided, the chip renders as `<a href>` and modifier-
   *  clicks fall through to the URL (open deep link in new tab).
   *  Plain left-click still calls `onClick`. Parity with list-row
   *  cmd+click behavior in B.PT138. */
  href?: string;
}) {
  const dur = durationMinutes(event);
  const display = chooseDisplay(dur);

  // Three render shapes:
  //   href + onClick  → <a> with click interception (modifier clicks
  //                     fall through to href; plain clicks call onClick)
  //   onClick only    → <button>
  //   neither         → <div> (purely presentational)
  const Component: "a" | "button" | "div" =
    href ? "a" : onClick ? "button" : "div";

  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    if (Component === "a") {
      // Let modifier clicks fall through to href (new tab / window).
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

  // CSS variable for the status accent. Used as the bar fill + as the
  // border tint via color-mix in the wrapper styles below.
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
        // Subtle paper-tinted background; the left bar carries the color.
        "bg-[color:color-mix(in_srgb,var(--oh-paper)_70%,white)]",
        "hover:bg-[color:var(--oh-tint)]",
        // Cancelled bookings: line-through + dashed border, lower opacity
        event.status === "cancelled" &&
          "border border-dashed border-[color:var(--oh-line)] opacity-65 line-through",
        // Selected / hovered ring — paper halo + ink ring (matches
        // --oh-focus-shadow-input vocabulary)
        (isSelected || isHovered) && "ring-2 ring-[color:var(--oh-ink)]",
      )}
    >
      {/* Left color bar — 3px wide, full height. The fill carries
          status as a NON-color cue (B.PT146 — WCAG 1.4.1). Solid
          fill = confirmed; striped = tentative; solid + line-through
          on the chip body = cancelled. Sighted color-blind users
          can distinguish confirmed from tentative without relying
          on the green-vs-amber color alone. */}
      <span
        aria-hidden
        className="block h-full w-[3px] shrink-0"
        style={
          event.status === "tentative"
            ? {
                // 4px-tall stripes alternating status color + paper.
                // Reads as a "dashed" bar without using the property.
                backgroundImage: `repeating-linear-gradient(to bottom, ${statusVar} 0 4px, transparent 4px 8px)`,
              }
            : { background: statusVar }
        }
      />

      {/* Body */}
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
