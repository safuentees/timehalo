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
    <div className="oh-month-stack">
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
            className="oh-month"
            classNames={{
              root: "oh-month-root",
              months: "oh-month-months",
              month: "oh-month-col",
              month_caption: "oh-month-caption",
              caption_label: "oh-month-caption-label",
              weekdays: "oh-weekdays",
              weekday: "oh-weekday",
              week: "oh-week",
              day: "oh-day",
              today: "oh-day-today",
              outside: "oh-day-outside",
              disabled: "oh-day-disabled",
              hidden: "oh-day-hidden",
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
              available: "oh-day-available",
              booked: "oh-day-booked",
              closed: "oh-day-closed",
            }}
          />
        );
      })}
    </div>
  );
}
