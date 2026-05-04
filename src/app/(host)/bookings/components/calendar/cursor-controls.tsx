"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "../bookings-view-switcher";

export type BookingsCursorControlsProps = {
  view: ViewMode;
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

function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(1);
  result.setMonth(result.getMonth() + n);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(d: Date): string {
  return d
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

function formatWeekLabel(d: Date): string {
  const monday = startOfWeekMonday(d);
  const sunday = addDays(monday, 6);
  const startMonth = monday
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const startDay = monday.getDate();
  const endMonth = sunday
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const endDay = sunday.getDate();
  const year = sunday.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} — ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} — ${endMonth} ${endDay}, ${year}`;
}

function formatMonthLabel(d: Date): string {
  return d
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();
}

function formatLabel(view: ViewMode, d: Date): string {
  switch (view) {
    case "day":
      return formatDayLabel(d);
    case "week":
      return formatWeekLabel(d);
    case "month":
      return formatMonthLabel(d);
    case "list":
      return formatMonthLabel(d);
  }
}

function step(view: ViewMode, dir: -1 | 1, d: Date): Date {
  switch (view) {
    case "day":
      return addDays(d, dir);
    case "week":
      return addDays(d, dir * 7);
    case "month":
      return addMonths(d, dir);
    case "list":
      return d;
  }
}

export function BookingsCursorControls({
  view,
  cursorDate,
  onDateChange,
  nowOverride,
  className,
}: BookingsCursorControlsProps) {
  const today = nowOverride ?? new Date();
  const isOnToday = isSameDay(cursorDate, today);

  const goPrev = () => onDateChange(step(view, -1, cursorDate));
  const goNext = () => onDateChange(step(view, 1, cursorDate));
  const goToday = () =>
    onDateChange(
      new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <span className="font-mono text-[15px] font-extrabold uppercase leading-none tracking-[1.5px] tabular-nums">
        {formatLabel(view, cursorDate)}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={goPrev}
          aria-label={`Previous ${view}`}
          className={cn(
            "oh-focus-ring inline-flex size-8 items-center justify-center",
            "rounded-(--oh-r-xs) cursor-pointer transition-colors duration-150 ease-oh",
            "hover:bg-[color:var(--oh-tint)]",
          )}
        >
          <ChevronLeftIcon strokeWidth={1.75} className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={goToday}
          disabled={isOnToday}
          aria-label="Jump to today"
          className={cn(
            "oh-focus-ring inline-flex h-8 items-center justify-center px-3",
            "rounded-(--oh-r-xs) font-mono text-[11px] font-extrabold uppercase tracking-[1.5px]",
            "cursor-pointer transition-colors duration-150 ease-oh",
            isOnToday
              ? "opacity-35 cursor-not-allowed"
              : "hover:bg-[color:var(--oh-tint)]",
          )}
        >
          Today
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={`Next ${view}`}
          className={cn(
            "oh-focus-ring inline-flex size-8 items-center justify-center",
            "rounded-(--oh-r-xs) cursor-pointer transition-colors duration-150 ease-oh",
            "hover:bg-[color:var(--oh-tint)]",
          )}
        >
          <ChevronRightIcon strokeWidth={1.75} className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
