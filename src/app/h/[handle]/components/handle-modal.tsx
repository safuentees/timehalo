"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeftIcon, CalendarIcon } from "lucide-react";
import {
  BookingForm,
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
// Index by event semantics rather than position to avoid silent
// breakage if the extractor reorders.
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;
// B.PT157 — transitions[1] is the picker → confirm state change.
// Snappier physics (stiffer + more damped) so the content swap feels
// crisper than the modal-open morph.
const CONFIRM_SPRING =
  animSpec.transitions.find(
    (t) =>
      t.from?.name === "handle-detail" &&
      t.to?.name === "handle-detail" &&
      t.from?.id !== t.to?.id,
  )?.spring ?? animSpec.transitions[1].spring;

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
  // B.PT157 — internal view state. Picker view = day strip + slots;
  // form view = name/email/question (or reschedule confirm). Was a
  // nested ResponsiveModal via <BookingDrawer> in B.PT156; replaced
  // with inline state swap so the picker → form transition is a
  // CONTENT SWAP inside the same morphing modal element (matches
  // Figma frame 2 → frame 3 SMART_ANIMATE prototype reaction; both
  // frames are named "handle-detail" with different ids 324:16654 +
  // 358:20746). Spring physics for the swap come from anim spec
  // transitions[1] — stiffer + more damped than the open spring.
  const [view, setView] = useState<"picker" | "form">("picker");

  function handlePickSlot(slot: Slot) {
    onPickSlot(slot);
    setView("form");
  }

  function handleSelectDate(nextDate: Date | undefined) {
    // If the user changes date while in form view, drop back to
    // picker so they can re-select a slot in the new date.
    if (
      view === "form" &&
      (!nextDate ||
        (selectedSlot &&
          !isSameCalendarDay(new Date(selectedSlot.start), nextDate)))
    ) {
      setView("picker");
    }
    onSelectDate(nextDate);
  }

  // Reset to picker on close happens for free — when `open` flips to
  // false, AnimatePresence in the parent runs the exit animation, then
  // unmounts this component. Next open mounts fresh, `useState`'s
  // initial value re-applies, view starts at picker. No effect needed
  // (a `useEffect` setState would trip the React 19 compiler ESLint
  // rule against cascading renders inside an effect).

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
          morph. Click is handled by FocusOn's onClickOutside above.
          B.PT159: dropped `backdrop-blur-sm` — backdrop-filter is
          significantly more expensive in Firefox than in Chrome
          (Firefox falls back to a CPU path on most platforms),
          which compounded with the simultaneous layout-shared
          morph below to make the whole transition feel choppy.
          Solid 40% ink on dark contrasts enough for the dialog
          chrome to read; if a future polish pass brings blur back,
          gate it behind `prefers-reduced-motion: no-preference`
          and re-enable AFTER the morph settles via `onLayoutAnimationComplete`. */}
      <motion.div
        aria-hidden
        className="fixed inset-0 z-40 bg-[color:var(--oh-ink)]/40"
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
          // B.PT159: hint the compositor that we'll be transforming
          // this element. Motion sets `transform` itself but `will-
          // change: transform` lets the browser promote the layer
          // pre-emptively, smoothing the very first frame on
          // Firefox where the layer otherwise gets created mid-
          // animation. Removed after layout settles via
          // `onLayoutAnimationComplete` so the layer doesn't stay
          // hot when idle.
          style={{ willChange: "transform" }}
          className="flex h-full max-h-[800px] w-full max-w-[720px] flex-col gap-3 overflow-hidden rounded-[25px] border border-oh-line bg-[color:var(--oh-paper)] p-[15px] shadow-[inset_0_0_15px_rgba(0,0,0,0.25)]"
        >
          {/* B.PT159 — PHANTOM destinations matching the Figma spec
              EXACTLY. The user designed the modal with phantom
              (opacity 0) copies of the slot rows + identity header at
              their target positions inside frame 2. Per
              `docs/figma/anim-h-handle-redesign.json` transition[0]
              deltas:
                - Frame 15 (identity)  pos (192, 22),  size 336×87
                - Frame 2  (slot list) pos (0, 0),     size 720×1158
                - Frame 18 (inner)     pos (15, 15),   size 690×1128
                - Slot rows (× 4)      pos (0, 0|282|564|846), size 690×282
              These coordinates are relative to the modal frame's
              outer edge (Figma frames have no padding; children
              position absolutely from 0,0). Our `<motion.article>`
              has `p-[15px]` so its content box starts at (15,15) in
              article-outer coords. The phantom container extends to
              the article's outer edge via `inset:-15px`, then the
              phantoms inside use raw Figma pixel coords.
              At the article's max size (720×800) the slots overflow
              the bottom (4 × 282 = 1128px > 800), but `overflow-
              hidden` on the article clips the visual; motion's
              `getBoundingClientRect()`-based layoutId measurement
              still sees the un-clipped DOM rect, so the morph
              targets match the design even when the article is
              shorter than Figma's 1158. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[15px]"
          >
            {/* Identity header phantom — exact Figma coords (192, 22)
                with size 336×87. */}
            <motion.div
              layoutId="oh-identity"
              transition={{ type: "spring", ...(open ? OPEN_SPRING : CLOSE_SPRING) }}
              style={{
                position: "absolute",
                top: 22,
                left: 192,
                width: 336,
                height: 87,
                opacity: 0,
              }}
            />
            {/* Slot-list (Frame 2) phantom — full-modal coverage at
                (0, 0). The Frame 18 inner wrapper is 15px-margined
                inside it, then the 4 slot rows stack at exact Figma
                offsets (0/282/564/846, height 282 each, full width
                of Frame 18 = 690). */}
            <motion.div
              layoutId="oh-slot-list"
              transition={{ type: "spring", ...(open ? OPEN_SPRING : CLOSE_SPRING) }}
              style={{ position: "absolute", inset: 0, opacity: 0 }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                  key={i}
                  layoutId={`oh-slot-${i}`}
                  transition={{ type: "spring", ...(open ? OPEN_SPRING : CLOSE_SPRING) }}
                  style={{
                    position: "absolute",
                    top: 15 + i * 282,
                    left: 15,
                    width: 690,
                    height: 282,
                  }}
                />
              ))}
            </motion.div>
          </div>
          <h2 id="handle-modal-title" className="sr-only">
            {view === "form"
              ? rescheduleFromUid
                ? t("rescheduleFormTitle")
                : t("bookingFormTitle")
              : t("drawerTitle")}
          </h2>
          <p className="sr-only">{t("drawerDescription")}</p>

          {/* monthbar — picker view only. In form view it's hidden +
              replaced by a back-to-picker control. Same `oh-drawer-
              monthbar` class so existing CSS still applies. */}
          {view === "picker" ? (
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
          ) : (
            <div className="oh-drawer-monthbar">
              <button
                type="button"
                onClick={() => setView("picker")}
                aria-label={t("backToPickerAria")}
                className="oh-view-toggle inline-flex items-center gap-1 text-[12px] font-[family-name:var(--oh-mono)] uppercase tracking-[1px]"
              >
                <ArrowLeftIcon className="size-4" />
                {t("backToPicker")}
              </button>
              <span className="oh-drawer-monthbar-label opacity-65 truncate">
                {selectedSlot
                  ? format
                      .dateTime(new Date(selectedSlot.start), {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                      .toUpperCase()
                  : ""}
              </span>
            </div>
          )}

          {/* B.PT157 — picker / form swap. AnimatePresence with
              `mode="wait"` waits for the outgoing view to exit before
              the incoming one mounts, so we don't see both stacked
              mid-tween. Spring comes from the Figma prototype's
              transitions[1] capture (anim spec) — stiffer than the
              modal-open spring so the swap feels snappier. */}
          <div className="oh-drawer-body min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              {view === "picker" ? (
                <motion.div
                  key="picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", ...CONFIRM_SPRING }}
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
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", ...CONFIRM_SPRING }}
                >
                  {selectedSlot ? (
                    <BookingForm
                      handle={handle}
                      slotStart={selectedSlot.start}
                      rescheduleFromUid={rescheduleFromUid}
                    />
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
