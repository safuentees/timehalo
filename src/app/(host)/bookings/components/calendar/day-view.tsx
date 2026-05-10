"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { HourAxis } from "./hour-axis";
import { TimeGridColumn } from "./time-grid-column";

// Day mode — single-column time grid.
//
// Default range: 0-23 (full 24 hours), matching cal.com's default
// (`packages/features/calendars/weeklyview/state/store.ts:21-22`).
// On mount we auto-scroll the capped wrapper to put the current
// time (when today is in view) or 8am (otherwise) at the center
// of the visible window — same UX cal.com ships, but without the
// 100ms `setTimeout` race-condition workaround they use (we scroll
// the wrapper directly via scrollTop in a useEffect rather than
// waiting for an inner ref to mount + calling scrollIntoView).
//
// Layout: `[hour-axis 56px] [day-column 1fr]`. Day header reads
// just the date in eyebrow style (B.PT291 — weekday name was
// redundant with cursor controls).
//
// Default scale: oneMinuteHeightPx = 1 (= 60px per hour, matching
// cal.com's --one-minute-height: 1px default).

// Scroll target hour when the displayed day is NOT today (no
// "current time" anchor). 8am roughly matches the booking-flow
// working-hours assumption + cal.com's behavior of scrolling to
// the start of typical working hours.
const SCROLL_TARGET_HOUR_DEFAULT = 8;

export type DayViewProps = {
  date: Date;
  events: CalendarEvent[];
  /** First hour rendered. Default 0 (midnight). */
  startHour?: number;
  /** Last hour rendered, inclusive. Default 23 (11pm). */
  endHour?: number;
  /** Pixels per minute. Default 1 (60px per hour). */
  oneMinuteHeightPx?: number;
  selectedRefId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** Cmd+click parity (B.PT142) — chips become `<a href>` so power
   *  users open the standalone /bookings/<uid> page in a new tab. */
  getHref?: (event: CalendarEvent) => string;
  /** CSS max-height for the body. Default uses viewport-relative
   *  `calc(100dvh - 280px)` so the calendar fills the available
   *  vertical space on tall screens (B.PT143 — was a fixed 640px,
   *  which wasted ~30% of pixel real estate on a 1080p display).
   *  Pass `"none"` to opt out of any cap (playground / Storybook). */
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

  // Scroll container. When `maxBodyHeight !== "none"`, the body is
  // capped + scrollable; sticky day-header stays at top. Default
  // uses viewport-relative `calc(100dvh - 280px)` (B.PT143 — was a
  // fixed 640px which under-used tall screens). Playground passes
  // `"none"` so the visual regression baseline captures full height.
  //
  // B.PT304 — when caller passes `"100%"` the view runs in
  // fit-parent mode: claim remaining flex space via `flex-1
  // min-h-0` instead of relying on max-height. `max-height: 100%`
  // alone doesn't share viewport space with sibling chrome (view
  // switcher + cursor controls above) — flex layout needs the
  // child to be flex-1 to compute the shared distribution.
  const isCapped = maxBodyHeight !== "none";
  const isFitParent = maxBodyHeight === "100%";
  const bodyStyle =
    isCapped && !isFitParent ? { maxHeight: maxBodyHeight } : undefined;

  // Auto-scroll to a meaningful hour on cursor change (B.PT292).
  // Now that the grid renders 0-23 (24h), we'd otherwise paint the
  // capped wrapper aimed at midnight by default. Cal.com's
  // `CurrentTime` component (apps/web/modules/calendars/weeklyview/
  // components/currentTime/index.tsx:47-52) does the same with
  // `scrollIntoView({ block: "center" })` plus a 100ms setTimeout
  // workaround (the scroll target ref isn't in the DOM yet at
  // first effect). We sidestep that race by scrolling the wrapper
  // directly via scrollTop — wrapper ref is mounted by the time
  // useEffect fires, no setTimeout needed.
  // Target: today + cursor matches → current time; otherwise →
  // 8am (typical working hours start). `dateKey` (YYYY-MM-DD)
  // gates re-runs to actual date changes, not Date object identity.
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
    // Center the target in the visible window. Math.max guards
    // against negative scroll on short calendars.
    const desiredScroll = targetPx - wrapper.clientHeight / 2;
    wrapper.scrollTop = Math.max(0, desiredScroll);
    // `dateKey` covers the date prop; the rest of the deps are
    // stable across re-renders unless the parent intentionally
    // changes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, startHour, oneMinuteHeightPx, isCapped]);

  // Region label for screen readers (B.PT145). "Day view for Mon
  // May 4" gives SR users context when they focus into the grid.
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
      // tabIndex=0 makes the scrollable region keyboard-focusable so
      // users can scroll the calendar with arrow keys (B.PT149 —
      // axe rule scrollable-region-focusable). When the body is not
      // capped (playground), no scroll, no need.
      tabIndex={isCapped ? 0 : undefined}
      className={cn(
        // B.PT290 — outer hairline border replaced with a drop shadow
        // (`0 3px 12px rgba(0,0,0,0.22)` — canonical app vocabulary,
        // same as `oh` button + pill switcher's active chip + sidebar
        // active row). Defines the calendar surface as an elevated
        // paper card on the page paper bg without a contrasting ink
        // line. Inner grid borders (hour axis, header bottom rule,
        // event-chip dividers) are STRUCTURAL — they convey "this is
        // a grid" not "this is a card edge" — kept as hairlines.
        "flex flex-col rounded-(--oh-r-sm) bg-[color:var(--oh-paper)]",
        "shadow-[var(--oh-shadow-resting)]",
        isCapped && "overflow-y-auto",
        isFitParent && "min-h-0 flex-1",
      )}
      style={bodyStyle}
    >
      {/* Day-view sticky scroll-anchor (B.PT291).
          Three redundancies prior — the date was shown in cursor
          controls (above the calendar: "MON, MAY 4"), the day strip
          on mobile (highlighted MON 4 pill), AND in this header
          (MONDAY MAY 4 with big bold number + black today-circle).
          Cursor controls is the canonical date affordance for the
          page (Google Calendar / Apple Calendar / Cal.com all drop
          the in-grid day title for the same reason). This header
          stays only for internal-scroll context — when the user
          scrolls past the cursor controls inside the capped
          calendar viewport, the eyebrow keeps date context on
          screen.
          Format: just the date ordinal in `oh-eyebrow` (mono caps
          metadata vocabulary), no weekday name (redundant with
          cursor controls), no big number layer, no pill / circle.
          Today indicator: a small green dot — same shape + color
          (`--oh-status-confirmed`) the day strip uses for its
          today marker, so the visual cue is consistent across both
          surfaces. */}
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

      {/* Body — hour axis + single time-grid column */}
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
