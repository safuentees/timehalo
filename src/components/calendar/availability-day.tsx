"use client";

import type { DayButtonProps } from "react-day-picker";
import { toKey, startOfToday } from "@/lib/availability";
import type { DayDensity } from "@/lib/availability";

type Props = DayButtonProps & {
  densityMap: Map<string, DayDensity>;
};

/**
 * Brutalist day cell: date number + 0–3 density squares below. Past days
 * render muted without strikethrough; future closed days strikethrough.
 * Available days invert on hover via the parent `.bru-day-available` modifier.
 */
export function AvailabilityDay({
  day,
  modifiers: _modifiers,
  densityMap,
  className,
  disabled,
  ...buttonProps
}: Props) {
  const density = densityMap.get(toKey(day.date));
  const level = density?.level ?? 0;
  const isPast = day.date < startOfToday();
  const isClosed = !isPast && level === 0;

  const numClass = isPast
    ? "bru-day-num--past"
    : isClosed
      ? "bru-day-num--closed"
      : "bru-day-num";

  return (
    <button
      {...buttonProps}
      type="button"
      className={`bru-day-button ${className ?? ""}`}
      disabled={disabled || level === 0}
      aria-label={
        level === 0
          ? `${day.date.toDateString()}, no slots`
          : `${day.date.toDateString()}, ${density!.count} slots`
      }
    >
      <span className={numClass}>{day.date.getDate()}</span>
    </button>
  );
}
