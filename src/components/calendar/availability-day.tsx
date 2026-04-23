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
  modifiers,
  densityMap,
  className,
  disabled,
  ...buttonProps
}: Props) {
  void modifiers;
  const density = densityMap.get(toKey(day.date));
  const isPast = day.date < startOfToday();
  const isClosed = !isPast && !density;
  const isFullyBooked = !isPast && !!density?.isFullyBooked;

  const numClass = isPast
    ? "bru-day-num--past"
    : isFullyBooked
      ? "bru-day-num--full"
      : isClosed
      ? "bru-day-num--closed"
      : "bru-day-num";

  return (
    <button
      {...buttonProps}
      type="button"
      className={`bru-day-button ${className ?? ""}`}
      disabled={disabled || !density}
      aria-label={
        !density
          ? `${day.date.toDateString()}, no slots`
          : density.isFullyBooked
            ? `${day.date.toDateString()}, fully booked`
            : `${day.date.toDateString()}, ${density.count} open slots`
      }
    >
      <span className={numClass}>{day.date.getDate()}</span>
    </button>
  );
}
