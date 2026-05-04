"use client";

export type HourAxisProps = {
  startHour: number;
  endHour: number;
  oneMinuteHeightPx: number;
  hourFormat?: 12 | 24;
};

function formatHour(hour: number, format: 12 | 24): string {
  if (format === 24) return `${hour.toString().padStart(2, "0")}:00`;
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
