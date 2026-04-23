"use client";

import { useMemo } from "react";
import { addMonths, startOfMonth } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { startOfToday, toKey } from "@/lib/availability";
import type { DayDensity } from "@/lib/availability";
import { AvailabilityDay } from "./availability-day";

type Props = {
  months: number;
  densityMap: Map<string, DayDensity>;
  selectedDate: Date | undefined;
  onSelectDate: (d: Date) => void;
};

export function MonthStack({
  months,
  densityMap,
  selectedDate,
  onSelectDate,
}: Props) {
  const firstMonth = useMemo(() => startOfMonth(new Date()), []);
  const today = useMemo(() => startOfToday(), []);

  return (
    <div className="bru-month-stack">
      {Array.from({ length: months }).map((_, i) => {
        const monthStart = addMonths(firstMonth, i);
        return (
          <Calendar
            key={monthStart.toISOString()}
            mode="single"
            month={monthStart}
            selected={selectedDate}
            onSelect={(d) => {
              if (d) onSelectDate(d);
            }}
            hideNavigation
            disableNavigation
            showOutsideDays={false}
            className="bru-month"
            classNames={{
              root: "bru-month-root",
              months: "bru-month-months",
              month: "bru-month-col",
              month_caption: "bru-month-caption",
              caption_label: "bru-month-caption-label",
              weekdays: "bru-weekdays",
              weekday: "bru-weekday",
              week: "bru-week",
              day: "bru-day",
              today: "bru-day-today",
              outside: "bru-day-outside",
              disabled: "bru-day-disabled",
              hidden: "bru-day-hidden",
            }}
            components={{
              DayButton: (props) => (
                <AvailabilityDay {...props} densityMap={densityMap} />
              ),
            }}
            modifiers={{
              available: (d) => {
                const density = densityMap.get(toKey(d));
                return !!density && !density.isFullyBooked;
              },
              booked: (d) => densityMap.get(toKey(d))?.isFullyBooked ?? false,
              closed: (d) => !densityMap.get(toKey(d)) && d >= today,
            }}
            modifiersClassNames={{
              available: "bru-day-available",
              booked: "bru-day-booked",
              closed: "bru-day-closed",
            }}
          />
        );
      })}
    </div>
  );
}
