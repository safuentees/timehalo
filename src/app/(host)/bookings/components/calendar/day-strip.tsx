"use client";

import { motion } from "motion/react";
import { useId, useMemo } from "react";
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
  const layoutId = useId();

  return (
    <div
      role="tablist"
      aria-label="Day picker"
      className={cn(
        "flex w-full items-stretch gap-0 overflow-x-auto",
        "rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px]",
        "shadow-[var(--oh-shadow-resting)]",
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
              "group oh-focus-ring relative flex flex-1 basis-0 flex-col items-center gap-1",
              "rounded-(--oh-r-xs) px-2 py-1.5 cursor-pointer min-w-[52px]",
              "transition-colors duration-150 ease-oh outline-none",
            )}
          >
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
