"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Drawer } from "vaul";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import { DayStrip } from "./day-strip";
import { MonthDrawer } from "./month-drawer";
import { DaySlots } from "./day-slots";
import { BookingDrawer } from "./booking-drawer";

type Props = {
  handle: string;
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  onBooked: () => void;
  months?: number;
  selectedSlot: Slot | undefined;
};

export function AvailabilityDrawer({
  handle,
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  onBooked,
  months = 3,
  selectedSlot,
}: Props) {
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const [bookingOpen, setBookingOpen] = useState(false);

  function handlePickSlot(slot: Slot) {
    onPickSlot(slot);
    setBookingOpen(true);
  }

  function handleDrawerOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setBookingOpen(false);
    }

    onOpenChange(nextOpen);
  }

  function handleSelectDate(nextDate: Date | undefined) {
    if (
      bookingOpen &&
      (!nextDate ||
        (selectedSlot &&
          !isSameCalendarDay(new Date(selectedSlot.start), nextDate)))
    ) {
      setBookingOpen(false);
    }

    onSelectDate(nextDate);
  }

  return (
    <Drawer.Root open={open} onOpenChange={handleDrawerOpenChange}>
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
              onSelectDate={handleSelectDate}
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
              onSelectDate={handleSelectDate}
            />

            {selectedDate ? (
              <DaySlots
                date={selectedDate}
                slots={dayOfSlots}
                onPick={handlePickSlot}
              />
            ) : (
              <p className="bru-drawer-hint">
                — TAP A DATE ABOVE TO SEE TIMES —
              </p>
            )}
          </div>
          <BookingDrawer
            handle={handle}
            slot={selectedSlot}
            open={bookingOpen}
            onOpenChange={setBookingOpen}
            onBooked={() => {
              setBookingOpen(false);
              onBooked();
            }}
          />
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

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
