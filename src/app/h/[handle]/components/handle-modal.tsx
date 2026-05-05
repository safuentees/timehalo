"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon } from "lucide-react";
import {
  BookingDrawer,
  DayStrip,
  DaySlots,
  MonthDrawer,
} from "@/components/calendar";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";

const OPEN_SPRING = animSpec.transitions[0].spring;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

type Props = {
  handle: string;
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  selectedSlot: Slot | undefined;
  rescheduleFromUid?: string;
  months?: number;
};

export function HandleModal({
  handle,
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  selectedSlot,
  rescheduleFromUid,
  months = 3,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const monthBarLabel = format
    .dateTime(monthBarDate, { month: "long", year: "numeric" })
    .toUpperCase();
  const [bookingOpen, setBookingOpen] = useState(false);

  function handlePickSlot(slot: Slot) {
    onPickSlot(slot);
    setBookingOpen(true);
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

  if (!open) return null;

  return (
    <FocusOn
      enabled={open}
      onEscapeKey={() => onOpenChange(false)}
      onClickOutside={() => onOpenChange(false)}
      returnFocus
    >
      <motion.div
        aria-hidden
        className="fixed inset-0 z-40 bg-[color:var(--oh-ink)]/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="handle-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      >
        <motion.article
          layoutId="handle-card"
          transition={{ type: "spring", ...(open ? OPEN_SPRING : CLOSE_SPRING) }}
          className="flex h-full max-h-[800px] w-full max-w-[720px] flex-col gap-3 overflow-hidden rounded-[25px] border border-oh-line bg-[color:var(--oh-paper)] p-[15px] shadow-2xl"
        >
          <h2 id="handle-modal-title" className="sr-only">
            {t("drawerTitle")}
          </h2>
          <p className="sr-only">{t("drawerDescription")}</p>

          <div className="oh-drawer-monthbar">
            <span className="oh-drawer-monthbar-label">{monthBarLabel}</span>
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

          <motion.div
            className="oh-drawer-body min-h-0 flex-1 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
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
          </motion.div>

          <BookingDrawer
            handle={handle}
            slot={selectedSlot}
            open={bookingOpen}
            onOpenChange={setBookingOpen}
            rescheduleFromUid={rescheduleFromUid}
          />
        </motion.article>
      </div>
    </FocusOn>
  );
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
