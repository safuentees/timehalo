"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type DayStripProps = {
  cursorDate: Date;
  onDateChange: (next: Date) => void;
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
