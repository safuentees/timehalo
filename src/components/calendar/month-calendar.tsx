"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { computeDensityMap, type Slot } from "@/lib/availability";
import { MonthStack } from "./month-stack";

type Props = {
  slots: Slot[];
  selectedDate?: Date;
  onSelectDate: (date: Date) => void;
  /** Number of months to render in the stack. */
  months?: number;
};

/**
 * Inline month calendar — same visual chrome MonthDrawer renders inside
 * its Vaul popup, but here as a regular block component so callers can
 * inline it alongside other content (e.g. inside a modal's cream
 * container instead of a separate sheet).
 *
 * B.PT239 — extracted so the visitor `/h/[handle]` modal can host the
 * month grid inline as a sub-view of its picker. MonthDrawer (the
 * popup variant) still exists; both consume `MonthStack` underneath.
 *
 * Internal scroll: caller is responsible for sizing — wrap in a flex
 * column with a known height and the `MonthStack` will scroll within
 * the available area via `overflow-y-auto` on this primitive's body.
 */
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
