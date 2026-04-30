"use client";

import { type ReactNode, useMemo, useState } from "react";
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

const WEEKDAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function MonthDrawer({
  slots,
  selectedDate,
  onSelectDate,
  months = 3,
  title = "CHOOSE A DATE",
  description = "Pick a date from the full month calendar.",
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);

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
            {title}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription className="sr-only">
            {description}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="oh-drawer-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((d) => (
            <span key={d} className="oh-drawer-weekdays-cell">
              {d}
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
