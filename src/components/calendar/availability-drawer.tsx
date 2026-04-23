"use client";

import { CalendarIcon } from "lucide-react";
import { Drawer } from "vaul";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import { DayStrip } from "./day-strip";
import { MonthDrawer } from "./month-drawer";
import { DaySlots } from "./day-slots";

type Props = {
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  months?: number;
};

export function AvailabilityDrawer({
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  months = 3,
}: Props) {
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content">
          <Drawer.Handle className="bru-drawer-handle" />
          <div className="bru-drawer-head">
            <Drawer.Title className="bru-drawer-title">
              SCHEDULE YOUR MEETING
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Pick a day and a time for your 15-minute meeting.
            </Drawer.Description>
          </div>

          <div className="bru-drawer-monthbar">
            <span className="bru-drawer-monthbar-label">
              {fmtMonthYear(monthBarDate)}
            </span>
            <MonthDrawer
              slots={slots}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              months={months}
            >
              <button
                type="button"
                className="bru-view-toggle"
                aria-label="Open month view"
              >
                <CalendarIcon />
              </button>
            </MonthDrawer>
          </div>

          <div className="bru-drawer-body">
            <DayStrip
              slots={slots}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
            />

            {selectedDate ? (
              <DaySlots
                date={selectedDate}
                slots={dayOfSlots}
                onPick={onPickSlot}
              />
            ) : (
              <p className="bru-drawer-hint">
                — TAP A DATE ABOVE TO SEE TIMES —
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function fmtMonthYear(d: Date): string {
  return d
    .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    .toUpperCase();
}
