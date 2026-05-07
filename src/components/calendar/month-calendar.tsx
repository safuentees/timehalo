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
 * B.PT246 — back to Radix `ScrollArea` for the overlay treatment.
 * Per Radix docs (radix-ui.com/primitives/docs/components/scroll-
 * area) the canonical structure puts padding on the CONTENT inside
 * the Viewport, NOT on the Root. The previous attempt put `px-5
 * pb-8 pt-2 overflow-hidden` on the Root which pushed the Viewport
 * into a padded area and confused scroll detection. Now the Root
 * just sizes itself via flex (`min-h-0 flex-1`), the Viewport
 * fills it edge-to-edge, and an inner padded `<div>` carries the
 * spacing for the MonthStack content.
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
