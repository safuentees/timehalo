"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { XIcon } from "lucide-react";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import {
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
} from "../../components/handle-morph-parts";
import { HandleMorphCard } from "../../components/handle-morph-card";
import { useModalDebug } from "../../_components/visitor-debug-overlay";
import { type BookingConfirmationBooking } from "./booking-confirmation";
import { BookingReceiptContent } from "./booking-receipt-content";

const OPEN_SPRING = animSpec.transitions[0].spring;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

export function BookingReceiptModal({
  booking,
}: {
  booking: BookingConfirmationBooking;
}) {
  const router = useRouter();
  const t = useTranslations("BookingConfirmation");
  const tCalendar = useTranslations("BookingCalendar");
  const format = useFormatter();
  const { values: debug, panelShardRef } = useModalDebug();
  const openSpring = debug?.openSpring ?? OPEN_SPRING;
  const closeSpring = debug?.closeSpring ?? CLOSE_SPRING;
  const focusShards = panelShardRef ? [panelShardRef] : [];

  // B.PT265 — top-bar title carries the date+time as the primary
  // confirmation signal (was just "Booked", which left the body
  // re-confirming the same fact via the big-date hero). With this
  // moved here, the body redesign can focus on host + meta + actions
  // without redundancy. Format the date and time as separate ICU
  // args so locale rules pick the right preposition + ordering.
  const startDate = new Date(booking.slotStart);
  const titleDate = format.dateTime(startDate, {
    month: "short",
    day: "numeric",
  });
  const titleTime = format.dateTime(startDate, {
    hour: "numeric",
    minute: "2-digit",
  });
  const titleText = t("badgeBookedOn", {
    date: titleDate,
    time: titleTime,
  });

  function close() {
    router.back();
  }

  return (
    <FocusOn
      enabled
      onEscapeKey={close}
      onClickOutside={close}
      returnFocus
      scrollLock={false}
      shards={focusShards}
      className="contents"
    >
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-label={t("badgeBooked")}
      >
        <button
          type="button"
          aria-label={tCalendar("closeDrawerAria")}
          className="absolute inset-0 cursor-default bg-transparent"
          onClick={close}
        />
        <HandleMorphCard
          key="booking-receipt-modal"
          layoutId="handle-card"
          transition={{ type: "spring", ...openSpring }}
          initial={{ ...HANDLE_CARD_RADIUS_STYLE, opacity: 1 }}
          animate={{ ...HANDLE_CARD_RADIUS_STYLE, opacity: 1 }}
          exit={{ ...HANDLE_CARD_RADIUS_STYLE, opacity: 1 }}
          style={{
            position: "relative",
            willChange: "transform",
          }}
          // B.PT266 — square shape mirrors form-card's strategy
          // (`min-h` + `w` resolved to the same min(viewport, 450)
          // expression so the card collapses to a square at every
          // viewport). Outer wrapper now `p-4 sm:p-8` (was p-[15px])
          // so receipt + form share the same available rect — the
          // shared `layoutId="handle-card"` morph from form-rect →
          // receipt-rect now lands as an opacity crossfade between
          // identically-sized squares with no scale tween. Inner
          // content gets `flex-1 + min-h-0` so the cream container
          // stretches to fill the square, same chain the form-card
          // uses to keep the picker / form fields stable inside.
          className="min-h-[min(calc(100dvw-32px),450px)] w-[min(calc(100dvw-32px),450px)] max-w-none overflow-hidden p-[15px] sm:min-h-[min(calc(100dvw-64px),450px)] sm:w-[min(calc(100dvw-64px),450px)]"
        >
          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-[15px]">
            <div className="relative z-30 grid h-7 shrink-0 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-2">
              <span aria-hidden />
              {/* B.PT271 — `layoutId="oh-modal-chrome-title"` (was
                  `oh-modal-title` — that id pairs with the form's
                  cream-content H2, which made the receipt's chrome
                  text appear to morph from inside the cream rather
                  than from the form's own chrome row). The new id
                  pairs with the form-modal's chrome span at
                  `handle-modal.tsx` `renderChromeRow()` — same
                  position (chrome row, both modals) so the morph
                  is a smooth in-place text-rect transition. */}
              <motion.span
                layoutId="oh-modal-chrome-title"
                layout="position"
                transition={{ type: "spring", ...openSpring }}
                className="justify-self-center truncate font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]"
              >
                {titleText}
              </motion.span>
              <button
                type="button"
                onClick={close}
                aria-label={tCalendar("closeDrawerAria")}
                className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-end rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
              >
                <XIcon
                  className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-active:scale-95 group-active:opacity-100"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </button>
            </div>
            <motion.div
              layoutId="oh-slot-list"
              transition={{ type: "spring", ...openSpring }}
              initial={{ ...HANDLE_SLOT_LIST_RADIUS_STYLE, opacity: 1 }}
              animate={{ ...HANDLE_SLOT_LIST_RADIUS_STYLE, opacity: 1 }}
              exit={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: 1,
                transition: { type: "spring", ...closeSpring },
              }}
              style={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
              }}
              className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF]"
            >
              <BookingReceiptContent booking={booking} />
            </motion.div>
          </div>
        </HandleMorphCard>
      </div>
    </FocusOn>
  );
}
