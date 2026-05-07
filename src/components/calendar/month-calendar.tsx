"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ScrollArea } from "@/components/ui/scroll-area";
import { computeDensityMap, type Slot } from "@/lib/availability";
import { MonthStack } from "./month-stack";

type Props = {
  slots: Slot[];
  selectedDate?: Date;
  onSelectDate: (date: Date) => void;
  months?: number;
};

export function MonthCalendar({
  slots,
  selectedDate,
  onSelectDate,
  months = 3,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);
  const weekdayLabels: ReadonlyArray<string> = [
    t("weekdayNarrowSun"),
    t("weekdayNarrowMon"),
    t("weekdayNarrowTue"),
    t("weekdayNarrowWed"),
    t("weekdayNarrowThu"),
    t("weekdayNarrowFri"),
    t("weekdayNarrowSat"),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="oh-drawer-weekdays" aria-hidden="true">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="oh-drawer-weekdays-cell">
            {label}
          </span>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1" data-view="month">
        <div className="px-5 pb-8 pt-2">
          <MonthStack
            months={months}
            densityMap={densityMap}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
