"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
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
      <div
        className="oh-drawer-body min-h-0 flex-1 overflow-y-auto"
        data-view="month"
      >
        <MonthStack
          months={months}
          densityMap={densityMap}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      </div>
    </div>
  );
}
