"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarIcon } from "lucide-react";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
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
  months?: number;
  selectedSlot: Slot | undefined;
  rescheduleFromUid?: string;
};

export function AvailabilityDrawer({
  handle,
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  months = 3,
  selectedSlot,
  rescheduleFromUid,
}: Props) {
  const t = useTranslations("BookingCalendar");
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
    <ResponsiveModal open={open} onOpenChange={handleDrawerOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader className="oh-drawer-head">
          <ResponsiveModalTitle className="oh-drawer-title">
            {t("drawerTitle")}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription className="sr-only">
            {t("drawerDescription")}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="oh-drawer-monthbar">
          <span className="oh-drawer-monthbar-label">
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
              className="oh-view-toggle"
              aria-label={t("openMonthViewAria")}
            >
              <CalendarIcon />
            </button>
          </MonthDrawer>
        </div>

        <div className="oh-drawer-body">
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
            <p className="oh-drawer-hint">— {t("tapDateHint")} —</p>
          )}
        </div>
        <BookingDrawer
          handle={handle}
          slot={selectedSlot}
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          rescheduleFromUid={rescheduleFromUid}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
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
