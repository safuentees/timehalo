"use client";

import { motion } from "motion/react";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

// Horizontal day picker for the mobile week-view fallback
// (B.PT148, §11 q1 follow-up — replaces option D from B.PT144's
// "build a custom mobile day-strip").
//
// Pattern: a row of 7 day buttons covering Monday through Sunday of
// the cursor's week. The currently-selected date gets the inverse-
// circle treatment (matches DayView's today indicator vocabulary).
// Tapping any button calls onDateChange with the new date — the
// parent updates the URL `?date=YYYY-MM-DD` so the DayView below
// re-renders against the new cursor.
//
// Reference: Google Calendar / Apple Calendar's mobile pattern.
// Cal.com's COLUMN_VIEW takes a different shape (multi-day time
// grid columns); for our project's narrow mobile width a horizontal
// picker + single-day grid is the better fit.
//
// Layout:
//   [MON  TUE  WED  THU  FRI  SAT  SUN]   ← horizontal scroll if needed
//   [ 4    5    6    7    8    9   10 ]   ← cursor-day gets inverse
//                                            circle; today gets a dot
//
// On viewports ≥7 buttons × ~52px = 364px, the strip fits without
// scroll. Below that (mobile under ~370px) it scrolls horizontally.

export type DayStripProps = {
  cursorDate: Date;
  onDateChange: (next: Date) => void;
  /** Override "today" for testing / playground pinning. */
  nowOverride?: Date;
  className?: string;
};

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + offset);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatWeekday(d: Date): string {
  return d
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
}

export function DayStrip({
  cursorDate,
  onDateChange,
  nowOverride,
  className,
}: DayStripProps) {
  const monday = useMemo(() => startOfWeekMonday(cursorDate), [cursorDate]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );
  const today = nowOverride ?? new Date();
  // Per-instance namespace for motion's `layoutId` so multiple day
  // strips on the same page (unlikely but defensive) don't try to
  // morph into each other.
  const layoutId = useId();

  return (
    <div
      role="tablist"
      aria-label="Day picker"
      className={cn(
        // B.PT287 — apply the OhPillSwitcher chrome to match the app
        // vocabulary: muted-paper track + 3px inset + drop shadow
        // (same `0 3px 12px rgba(0,0,0,0.22)` button shadow). The
        // strip now reads as one segmented control rather than 7
        // floating buttons; siblings the Day/Week/Month/List
        // switcher above with identical chrome.
        "oh-sheen flex w-full items-stretch gap-0 overflow-x-auto",
        "rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px]",
        "shadow-[var(--oh-shadow-resting)]",
        // Hide native scrollbar; the buttons themselves communicate
        // scrollability via overflow (only engages on viewports
        // narrower than 7 × 52px + gap, ~370px).
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {days.map((d) => {
        const isCursor = isSameDay(d, cursorDate);
        const isToday = isSameDay(d, today);
        const dateLabel = d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        return (
          <button
            key={d.toISOString()}
            type="button"
            role="tab"
            aria-selected={isCursor}
            aria-label={`Switch to ${dateLabel}`}
            onClick={() => {
              if (!isCursor) onDateChange(d);
            }}
            className={cn(
              // `flex-1 basis-0 min-w-[52px]` distributes equal
              // share of the row width with a 52px floor (below
              // 7×52+gap ≈ 370px the parent's `overflow-x-auto`
              // engages instead of cramming).
              // `relative` so the absolute-positioned motion pill
              // beneath sits inside the cell. Padding tightened from
              // `px-3 py-2` to `px-2 py-1.5` because the cell now
              // has its own painted pill — extra padding pushed the
              // pill too tall relative to the strip's height.
              "group oh-focus-ring relative flex flex-1 basis-0 flex-col items-center gap-1",
              "rounded-(--oh-r-xs) px-2 py-1.5 cursor-pointer min-w-[52px]",
              "transition-colors duration-150 ease-oh outline-none",
            )}
          >
            {/* Active cursor pill — paper-on-muted, slid between
                cells via motion's `layoutId`. Soft inner shadow
                (`0 1px 2px rgba(0,0,0,0.06), 0 1px 3px
                rgba(0,0,0,0.04)`) matches the OhPillSwitcher's
                active pill so the segmented-control aesthetic is
                identical across the calendar surface. Per the
                project's `motion-shared-layout.md`: forward
                `transition` so the spring honors callsite intent
                (220ms, no bounce) instead of motion's 0.45s
                default. */}
            {isCursor ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 rounded-(--oh-r-xs) bg-oh-paper shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
                transition={{
                  type: "spring",
                  duration: 0.22,
                  bounce: 0,
                }}
              />
            ) : null}
            <span
              className={cn(
                "oh-eyebrow relative z-10 transition-opacity duration-150",
                isCursor
                  ? "opacity-100"
                  : "opacity-55 group-hover:opacity-100",
              )}
            >
              {formatWeekday(d)}
            </span>
            {/* Date number. Cursor day = strong ink-bold inside the
                paper pill (the pill IS the indicator now — drops the
                heavy black circle that competed with the cell-level
                bg-tint). Inactive days = same weight, lower opacity
                via parent text color. */}
            <span
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative z-10 font-sans text-[18px] leading-none tracking-tight tabular-nums",
                isCursor
                  ? "font-bold text-[color:var(--oh-ink)]"
                  : "font-semibold text-[color:var(--oh-content-muted)]",
              )}
            >
              {d.getDate()}
            </span>
            {/* Today indicator — small green dot below the date
                number. Always shown when the day IS today, even
                when it's also the cursor (the dot sits ABOVE the
                paper pill via z-10). Reserved spacer when not
                today so cell heights stay constant across the
                strip — no layout jump as the cursor moves. */}
            {isToday ? (
              <span
                aria-hidden
                className="relative z-10 block size-1 rounded-full bg-[color:var(--oh-status-confirmed)]"
              />
            ) : (
              <span aria-hidden className="relative z-10 block size-1" />
            )}
          </button>
        );
      })}
    </div>
  );
}
