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

// B.PT156 — bespoke morphing modal that replaces `AvailabilityDrawer`'s
// `<ResponsiveModal>` chrome on the visitor `/h/[handle]` page. The
// inner content (DayStrip + MonthDrawer monthbar + DaySlots +
// BookingDrawer) is preserved verbatim per user directive 2026-05-05:
// "the contents you must reuse in the new modal."
//
// The redesign's signature behavior is the SHARED-ELEMENT MORPH from
// the 385×387 landing card to the 720×1158 modal card, driven by the
// SMART_ANIMATE prototype reaction in Figma frame 1 → frame 2. The
// extracted animation contract (`docs/figma/anim-h-handle-redesign.json`
// transitions[0]) gives us spring physics:
//
//   { mass: 1, stiffness: 247, damping: 23.58, velocity: 0 }
//
// which `motion`'s Spring API consumes directly. A second contract
// (transitions[2]) covers the dismiss back to landing — slightly
// stiffer + more damped (`{ stiffness: 330.6, damping: 27.27 }`) so
// the close feels snappier than the open. Both come straight from
// the Figma capture; do NOT eyeball replacements.
//
// Layout-sharing happens via `layoutId="handle-card"` matched on the
// `<motion.article>` in `host-profile.tsx`. When the host page
// unmounts the landing card (modal opens) and mounts this component,
// motion measures both rects + tweens between them automatically. The
// inner content is faded in via opacity once the morph stabilizes;
// inversely on close. AvailabilityDrawer remains alive at
// `/w/[slug]/[eventTypeSlug]` — only the host page swaps to bespoke.
//
// `<FocusOn>` wraps the modal content with focus-trap + scroll-lock +
// aria-hidden sibling — `react-focus-on` (~3kb gzipped, MIT, React 19
// compatible). Required because we dropped the Radix Dialog primitive
// that provided these for free; same a11y bar from B.PT149 still applies.

const OPEN_SPRING = animSpec.transitions[0].spring;
// transitions[2] is "handle-detail → handle" — the dismiss spring.
// transitions[1] is the picker → confirm state change (handled in
// B.PT157). Index by event semantics rather than position to avoid
// silent breakage if the extractor reorders.
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
  /** How many calendar months the inner MonthDrawer should render. */
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
      // Returns focus to the previously-focused element (the slot row
      // that opened the modal) on close. Standard a11y contract Radix
      // Dialog gave us before; FocusOn restores it.
      returnFocus
    >
      {/* Backdrop — fades in/out with the modal. Outside the
          motion.article so it doesn't participate in the layoutId
          morph. Click is handled by FocusOn's onClickOutside above. */}
      <motion.div
        aria-hidden
        className="fixed inset-0 z-40 bg-[color:var(--oh-ink)]/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />

      {/* Modal card — shares `layoutId` with the landing card so motion
          auto-morphs between 385×387 (landing) and the modal's measured
          rect. `transition` switches to CLOSE_SPRING when the parent
          flips `open` to false; motion picks up the prop on the next
          render so the closing animation uses the dismissed-spring
          curve from Figma. Centered via flex parent. */}
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

          {/* monthbar — preserved from AvailabilityDrawer. Same class
              `oh-drawer-monthbar` so existing CSS still applies. */}
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

          {/* drawer body — preserved. Inner content fades in once the
              morph completes so users don't see the picker stretching.
              Initial-delay is half the open spring's nominal 650ms so
              the contents arrive after the card is ~half-way to its
              new size — matches the visual rhythm the Figma prototype
              implies. */}
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

          {/* Booking drawer — nested form once a slot is picked.
              Preserved verbatim from AvailabilityDrawer. */}
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
