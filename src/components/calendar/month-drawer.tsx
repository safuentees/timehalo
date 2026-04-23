"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Drawer } from "vaul";
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

/**
 * Nested Vaul drawer that isolates the month-picker. Mounts inside a
 * parent `<Drawer.Root>` as a `Drawer.NestedRoot`; vaul handles the
 * stacked-sheet behaviour. Picking a date calls `onSelectDate` and
 * auto-closes this drawer, leaving the parent open.
 */
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
    <Drawer.NestedRoot open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>{children}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content bru-drawer-content-nested">
          <Drawer.Handle className="bru-drawer-handle" />
          <div className="bru-drawer-head">
            <Drawer.Title className="bru-drawer-title">{title}</Drawer.Title>
            <Drawer.Description className="sr-only">
              {description}
            </Drawer.Description>
          </div>

          <div className="bru-drawer-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((d) => (
              <span key={d} className="bru-drawer-weekdays-cell">
                {d}
              </span>
            ))}
          </div>

          <div className="bru-drawer-body" data-view="month">
            <MonthStack
              months={months}
              densityMap={densityMap}
              selectedDate={selectedDate}
              onSelectDate={handlePick}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}
