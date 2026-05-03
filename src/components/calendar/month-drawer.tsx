"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import { computeDensityMap, type Slot } from "@/lib/availability";
import { MonthStack } from "./month-stack";

type Props = {
  slots: Slot[];
  selectedDate?: Date;
  onSelectDate: (date: Date) => void;
  months?: number;
  title?: string;
  description?: string;
  children: ReactNode;
};

/**
 * Nested Vaul drawer that isolates the month-picker. Mounts inside a
 * parent `<Drawer.Root>` as a `Drawer.NestedRoot`; vaul handles the
 * stacked-sheet behaviour. Picking a date calls `onSelectDate` and
 * auto-closes this drawer, leaving the parent open.
 *
 * B.PT91 — `title` + `description` defaults pulled from
 * `BookingCalendar` namespace; weekday narrow labels resolved per
 * locale (Sun=S/D, Mon=M/L, Tue=T/M, Wed=W/X, Thu=T/J, Fri=F/V,
 * Sat=S/S). Caller can still override `title`/`description` via
 * props to surface domain-specific copy.
 */
export function MonthDrawer({
  slots,
  selectedDate,
  onSelectDate,
  months = 3,
  title,
  description,
  children,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const [open, setOpen] = useState(false);
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);
  const resolvedTitle = title ?? t("monthDrawerTitle");
  const resolvedDescription = description ?? t("monthDrawerDescription");
  const weekdayLabels: ReadonlyArray<string> = [
    t("weekdayNarrowSun"),
    t("weekdayNarrowMon"),
    t("weekdayNarrowTue"),
    t("weekdayNarrowWed"),
    t("weekdayNarrowThu"),
    t("weekdayNarrowFri"),
    t("weekdayNarrowSat"),
  ];

  function handlePick(d: Date) {
    onSelectDate(d);
    setOpen(false);
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen} nested>
      <ResponsiveModalTrigger asChild>{children}</ResponsiveModalTrigger>
      <ResponsiveModalContent mobileClassName="oh-drawer-content-nested">
        <ResponsiveModalHeader className="oh-drawer-head">
          <ResponsiveModalTitle className="oh-drawer-title">
            {resolvedTitle}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription className="sr-only">
            {resolvedDescription}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="oh-drawer-weekdays" aria-hidden="true">
          {weekdayLabels.map((label, i) => (
            <span key={i} className="oh-drawer-weekdays-cell">
              {label}
            </span>
          ))}
        </div>

        <div className="oh-drawer-body" data-view="month">
          <MonthStack
            months={months}
            densityMap={densityMap}
            selectedDate={selectedDate}
            onSelectDate={handlePick}
          />
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
