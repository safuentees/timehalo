"use client";

// Left-side hour-label column for Day + Week time-grids.
//
// Hours are rendered with the project's `oh-eyebrow` typography
// (mono caps 10px) — matches the existing dashboard chrome. Each
// label is anchored at the TOP of its hour row (not centered) so
// the visual reads as "labels mark the start of the hour", which
// matches how cal.com / Google Calendar / etc. present hours.
//
// The width is 56px — wide enough for "12:00 AM" without truncation
// in 12-hour format.

export type HourAxisProps = {
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
  /** 12 = "1 PM" labels, 24 = "13:00" labels. Default 12. */
  hourFormat?: 12 | 24;
};

function formatHour(hour: number, format: 12 | 24): string {
  if (format === 24) return `${hour.toString().padStart(2, "0")}:00`;
  // 12-hour: "12 AM", "1 AM", … "12 PM", "1 PM", … "11 PM"
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function HourAxis({
  startHour,
  endHour,
  oneMinuteHeightPx,
  hourFormat = 12,
}: HourAxisProps) {
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  return (
    <div className="relative w-14 shrink-0">
      {hours.map((hour) => {
        const minutesFromStart = (hour - startHour) * 60;
        const top = minutesFromStart * oneMinuteHeightPx;
        return (
          <div
            key={hour}
            className="absolute left-0 right-0 flex justify-end pr-2"
            style={{ top: `${top}px` }}
          >
            <span className="oh-eyebrow tabular-nums leading-none">
              {formatHour(hour, hourFormat)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
