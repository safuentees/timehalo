"use client";

import { useMemo } from "react";
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

  return (
    <div
      role="tablist"
      aria-label="Day picker"
      className={cn(
        "flex items-stretch gap-1 overflow-x-auto",
        // Hide native scrollbar; the buttons themselves communicate
        // scrollability via overflow.
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
              "oh-focus-ring flex flex-col items-center gap-1.5 shrink-0",
              "rounded-(--oh-r-sm) px-3 py-2 cursor-pointer min-w-[52px]",
              "transition-colors duration-150 ease-oh",
              isCursor
                ? "bg-[color:var(--oh-tint)]"
                : "hover:bg-[color:var(--oh-tint)]",
            )}
          >
            <span
              className={cn(
                "oh-eyebrow",
                isCursor ? "opacity-100" : "opacity-55",
              )}
            >
              {formatWeekday(d)}
            </span>
            {/* Date number. Cursor day = inverse-circle (matches
                DayView's today-circle vocabulary so the user
                muscle-memories the meaning across views). Today,
                when not the cursor day, gets a small dot below the
                number. */}
            <span
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "font-sans text-[18px] font-bold leading-none tracking-tight tabular-nums",
                isCursor &&
                  "inline-flex size-7 items-center justify-center rounded-full bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)]",
              )}
            >
              {d.getDate()}
            </span>
            {/* Today indicator (when not the cursor) — a small dot
                below the date number. */}
            {isToday && !isCursor ? (
              <span
                aria-hidden
                className="block size-1 rounded-full bg-[color:var(--oh-status-confirmed)]"
              />
            ) : (
              <span aria-hidden className="block size-1" />
            )}
          </button>
        );
      })}
    </div>
  );
}
