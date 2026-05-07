"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon, ChevronLeftIcon, XIcon } from "lucide-react";
import {
  BookingForm,
  DayStrip,
  DaySlots,
  MonthCalendar,
} from "@/components/calendar";
import { slotsOn, startOfToday, type Slot } from "@/lib/availability";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import {
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
  HANDLE_SLOT_ROW_RADIUS_STYLE,
  SLOT_OPTIONS,
  SlotRow,
  cornerRadiusStyle,
} from "./handle-morph-parts";
import { HandleMorphCard } from "./handle-morph-card";

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
  /** B.PT175 — content rendered inside the `oh-identity` phantom
   *  rect (336×87 at 192,22 inside the modal frame) when the debug
   *  overlay's keepLandingMounted is on. Without this, the phantom
   *  is an empty rect and the user can't see what the identity
   *  header looks like at its post-morph destination. Mirrors what
   *  B.PT172 did for slot rows. */
  identityContent?: ReactNode;
  /** B.PT229 — duration label of the slot the visitor clicked on
   *  the landing card (e.g. "15 min"). Rendered centered in the
   *  chrome row between the back-chevron and close-X as the
   *  meeting-context header. */
  durationLabel?: string;
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
  identityContent,
  durationLabel,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();
  const monthBarLabel = format
    .dateTime(monthBarDate, { month: "long", year: "numeric" })
    .toUpperCase();
  // B.PT157 / B.PT239 — internal view state. Three views:
  //   strip — day strip + slots (the "picker" mode renamed from B.PT157)
  //   month — inline MonthCalendar (added B.PT239; was a popup before)
  //   form  — name/email/question (or reschedule confirm)
  // Was a nested ResponsiveModal via <BookingDrawer> in B.PT156;
  // replaced with inline state swap so the picker → form transition
  // is a CONTENT SWAP inside the same morphing modal element
  // (matches Figma frame 2 → frame 3 SMART_ANIMATE prototype
  // reaction; both frames are named "handle-detail" with different
  // ids 324:16654 + 358:20746). Spring physics for the swap come
  // from anim spec transitions[1] — stiffer + more damped than the
  // open spring.
  const [view, setView] = useState<"strip" | "month" | "form">("strip");
  const isPresent = useIsPresent();

  // B.PT232 — chrome-row text. Picker view shows duration only.
  // Form view (after slot pick) expands to "<duration> on <date>
  // at <start>" — natural language, no "from X to Y" since the
  // duration already implies the end time. Falsy when neither
  // duration nor slot is set (modal opened without a chip click).
  const chromeRowText = (() => {
    if (!durationLabel) return undefined;
    if (view === "form" && selectedSlot) {
      const start = new Date(selectedSlot.start);
      const datePart = format.dateTime(start, {
        month: "long",
        day: "numeric",
      });
      const timePart = format.dateTime(start, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${durationLabel} on ${datePart} at ${timePart}`;
    }
    return durationLabel;
  })();

  // B.PT164 / B.PT165 — resolved animation config comes from the
  // route-level provider mounted in `/h/[handle]/layout.tsx`.
  // Non-debug runtime receives the final inspect-mode production
  // target; dev `?debug=1` can override it. `panelShardRef` (B.PT165)
  // gets passed to
  // <FocusOn shards> so interactions on the Leva panel don't fire
  // the modal's onClickOutside / focus-trap escape.
  const { values: debug, panelShardRef } = useModalDebug();
  const openSpring = debug?.openSpring ?? OPEN_SPRING;
  const closeSpring = debug?.closeSpring ?? CLOSE_SPRING;
  const confirmSpring = debug?.confirmSpring ?? CONFIRM_SPRING;
  const phantomOutline = debug?.showPhantomOutline ?? false;
  // B.PT176 — overlay element-name labels on each phantom rect for
  // visual identification during inspection.
  const phantomLabels = debug?.showPhantomLabels ?? false;
  // B.PT167 / B.PT168 — Layer 2 z-index + opacity overrides for the
  // modal article + each phantom destination. Final runtime target:
  // zIndex undefined (no inline z), opacity 1 for the modal article,
  // and opacity 0 for identity / slot-list / slot phantoms. Dev
  // inspect sliders can raise individual phantoms when diagnosing.
  const zL2 = debug?.zLayer2;
  const oL2 = debug?.oLayer2;
  const detailTitleId = "handle-modal-title";
  const monthTitleId = "handle-modal-title-month";
  const formTitleId = "handle-modal-title-form";
  const currentTitleId =
    view === "month"
      ? monthTitleId
      : view === "form"
        ? formTitleId
        : detailTitleId;
  function handlePickSlot(slot: Slot) {
    onPickSlot(slot);
    setView("form");
  }

  function handleSelectDate(nextDate: Date | undefined) {
    // If the user changes date while in form view, drop back to
    // strip view so they can re-select a slot in the new date.
    if (
      view === "form" &&
      (!nextDate ||
        (selectedSlot &&
          !isSameCalendarDay(new Date(selectedSlot.start), nextDate)))
    ) {
      setView("strip");
    }
    onSelectDate(nextDate);
  }

  // B.PT239 — date picked in inline month view → swap back to strip
  // view (showing slots for that day). Per user flow: month →
  // strip-with-selected-day → slots → form.
  function handleMonthPick(nextDate: Date) {
    onSelectDate(nextDate);
    setView("strip");
  }

  // Reset to picker on close happens for free — when `open` flips to
  // false, AnimatePresence in the parent runs the exit animation, then
  // unmounts this component. Next open mounts fresh, `useState`'s
  // initial value re-applies, view starts at picker. No effect needed
  // (a `useEffect` setState would trip the React 19 compiler ESLint
  // rule against cascading renders inside an effect).

  function renderChromeRow() {
    return (
      <div className="relative z-30 grid h-7 shrink-0 grid-cols-3 items-center">
        <button
          type="button"
          onClick={() =>
            view === "strip" ? onOpenChange(false) : setView("strip")
          }
          aria-label={
            view === "strip" ? t("closeDrawerAria") : t("backToPickerAria")
          }
          className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-start rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
        >
          <ChevronLeftIcon
            className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-hover:scale-105 group-hover:opacity-100 group-active:scale-95 group-active:opacity-100"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
        <AnimatePresence mode="wait" initial={false}>
          {chromeRowText ? (
            <motion.span
              key={chromeRowText}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="justify-self-center truncate font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]"
            >
              {chromeRowText}
            </motion.span>
          ) : (
            <span className="justify-self-center" aria-hidden />
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t("closeDrawerAria")}
          className="oh-focus-ring group inline-flex size-7 shrink-0 items-center justify-center justify-self-end rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
        >
          <XIcon
            className="size-5 opacity-[0.7] transition-[opacity,transform] duration-150 ease-oh group-hover:scale-105 group-hover:opacity-100 group-active:scale-95 group-active:opacity-100"
            strokeWidth={2.25}
            aria-hidden
          />
        </button>
      </div>
    );
  }

  function renderIdentityPhantom() {
    const identityOpacity = oStyle(oL2?.identity, 0);
    const showIdentityContent = identityOpacity > 0;

    // B.PT259 — drop the wrapper motion.div with `layoutId="oh-
    // identity"`. Mirrors how slot chips are rendered (single
    // `layoutId="oh-slot-${i}"` per chip — no nested layoutId
    // pair) which the user identified as "always works and is
    // smooth". Why nesting two layoutIds was wrong:
    //
    // 1. Two animated layers. The outer `oh-identity` had no
    //    matching source in landing — it animated nothing useful
    //    but still ran motion's layout-projection bookkeeping
    //    every frame, fighting for control of the same `transform`
    //    property the inner `oh-identity-row` was already using.
    // 2. Race on close→reopen. AnimatePresence runs the outer's
    //    EXIT then mounts a fresh outer; if the user opens the
    //    next modal before exit completes, the new outer's
    //    `getBoundingClientRect()` reads stale layout state from
    //    the in-flight exit. Inner `oh-identity-row` then
    //    resolves its source rect against the wrong parent — the
    //    "title slides in from the right" the user reported on
    //    fast book→confirm→close cycles.
    //
    // Fix: positioning is owned by a plain `<div>` (no motion,
    // no layoutId, no inline transform). Flex parent centers
    // horizontally + paddingTop owns the vertical offset. The
    // ONLY animated element is the inner `<motion.div
    // layoutId="oh-identity-row">` passed in via `identityContent`
    // — same pattern as slot chips. Motion measures the inner
    // rect against this stable parent; no nested layout-projection
    // races possible.
    //
    // `display: flex; justifyContent: center` on the inner anchor
    // wraps `identityContent` in a centering container so the
    // natural-width avatar+name row sits dead-center on every
    // viewport. `maxWidth: 336` caps the centering region on
    // 720-wide cards (Figma's identity-row width); on narrower
    // form-card viewports it shrinks to card width without
    // overflow.
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex justify-center"
        style={{ paddingTop: 21.5 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            maxWidth: 336,
            height: 87,
            outline: phantomOutline ? "1px dashed currentColor" : undefined,
            opacity: identityOpacity,
            zIndex: zStyle(zL2?.identity),
            pointerEvents: "none",
          }}
        >
          {showIdentityContent && identityContent ? identityContent : null}
          {phantomLabels ? (
            <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
              identity
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSlotPhantoms({
    mode,
  }: {
    mode: "visible" | "measure";
  }) {
    // Month view still needs the chip layoutIds so closing from the
    // calendar has source rects to morph back to landing. Keep that
    // layer measurable but hidden while the calendar is present; reveal
    // it only during the parent exit so the chips visibly morph home.
    const isVisible = mode === "visible" || !isPresent;

    return (
      <div
        aria-hidden
        // B.PT248 — `[&_*]:pointer-events-none` cascades pointer-
        // events:none down to EVERY descendant via Tailwind's
        // arbitrary-variant + universal selector. Belt and
        // suspenders — even if motion's inline `pointer-events:
        // auto` were to leak onto the slot-stack motion.div or any
        // child, this rule still wins (universal-selector
        // specificity beats inline transform-induced auto in this
        // case because Tailwind utilities sit later in the cascade).
        className="pointer-events-none absolute inset-0 z-0 [&_*]:pointer-events-none"
        style={{ opacity: isVisible ? 1 : 0 }}
      >
        <motion.div
          layoutId="oh-slot-stack"
          transition={{
            type: "spring",
            ...(open ? openSpring : closeSpring),
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            boxShadow: "none",
            // B.PT248 — explicit pointer-events:none on the motion
            // root so motion's inline-style updates can't accidentally
            // re-enable events during a layout animation.
            pointerEvents: "none",
          }}
          className="p-[15px]"
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const opt = SLOT_OPTIONS[i];
            const slotRadiusStyle = cornerRadiusStyle(
              HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
            );
            return opt ? (
              <div
                key={i}
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                }}
              >
                <SlotRow
                  inert
                  figmaLayer={`modal-slot-${i}`}
                  layoutId={`oh-slot-${i}`}
                  transition={{
                    type: "spring",
                    ...(open ? openSpring : closeSpring),
                  }}
                  initial={{
                    ...HANDLE_SLOT_ROW_RADIUS_STYLE,
                    opacity: oStyle(
                      oL2
                        ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                        : undefined,
                      1,
                    ),
                  }}
                  animate={{
                    ...slotRadiusStyle,
                    opacity: oStyle(
                      oL2
                        ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                        : undefined,
                      1,
                    ),
                  }}
                  exit={{
                    ...HANDLE_SLOT_ROW_RADIUS_STYLE,
                    opacity: oStyle(
                      oL2
                        ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                        : undefined,
                      1,
                    ),
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    ...slotRadiusStyle,
                    boxShadow: "none",
                    outline: phantomOutline ? "1px dashed currentColor" : undefined,
                    zIndex: zStyle(
                      zL2
                        ? [zL2.slot0, zL2.slot1, zL2.slot2, zL2.slot3][i]
                        : undefined,
                    ),
                    pointerEvents: "none",
                  }}
                  title="intro"
                  description="quick chat, voice only"
                  durationLabel={opt.label}
                  onClick={() => {}}
                />
                {phantomLabels ? (
                  <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-cyan-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
                    slot {i}
                  </span>
                ) : null}
              </div>
            ) : null;
          })}
        </motion.div>
      </div>
    );
  }

  function renderCardShell({
    keyName,
    titleId,
    className,
    slotPhantomMode,
    sizing = "fill",
    children,
  }: {
    keyName: string;
    titleId: string;
    className: string;
    slotPhantomMode: "visible" | "measure";
    sizing?: "fill" | "hug" | "square";
    children: ReactNode;
  }) {
    const fillsAvailableSpace = sizing === "fill";
    const squaresAvailableSpace = sizing === "square";
    const stretchesSlotList = fillsAvailableSpace || squaresAvailableSpace;
    const slotListRadiusStyle = fillsAvailableSpace
      ? HANDLE_SLOT_LIST_RADIUS_STYLE
      : cornerRadiusStyle(
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
          HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
        );

    return (
      <HandleMorphCard
        key={keyName}
        // Every view card shares the outer shell identity. Motion's
        // shared-layout contract requires the entering element to
        // keep the same layoutId; otherwise form/month mount at their
        // final rect while only inner children like `oh-slot-list`
        // animate. Rapid close→reopen is handled outside by the
        // parent AnimatePresence `onExitComplete` gate.
        layoutId="handle-card"
        transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
        initial={{
          ...HANDLE_CARD_RADIUS_STYLE,
          opacity: oStyle(oL2?.layer, 1),
        }}
        animate={{
          ...HANDLE_CARD_RADIUS_STYLE,
          opacity: oStyle(oL2?.layer, 1),
        }}
        exit={{
          ...HANDLE_CARD_RADIUS_STYLE,
          opacity: oStyle(oL2?.layer, 1),
        }}
        style={{
          position: "relative",
          willChange: "transform",
          zIndex: zStyle(zL2?.layer),
        }}
        className={className}
      >
        {renderIdentityPhantom()}

        <div
          className={
            fillsAvailableSpace
              ? "absolute inset-[15px] z-10 flex min-h-0 flex-col gap-[15px]"
              : squaresAvailableSpace
                ? "relative z-10 flex min-h-0 flex-1 flex-col gap-[15px] p-[15px]"
                : "relative z-10 flex flex-col gap-[15px] p-[15px]"
          }
        >
          {renderChromeRow()}
          <motion.div
            layoutId="oh-slot-list"
            transition={{
              type: "spring",
              ...(open ? openSpring : closeSpring),
            }}
            initial={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            animate={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            exit={{
              ...slotListRadiusStyle,
              opacity: 1,
            }}
            style={{
              ...slotListRadiusStyle,
              boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
              outline: phantomOutline ? "1px dashed currentColor" : undefined,
              zIndex: zStyle(zL2?.slotList),
            }}
            className={
              stretchesSlotList
                ? "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF]"
                : "relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden bg-[#F5EFDF]"
            }
          >
            {phantomLabels ? (
              <span className="pointer-events-none absolute left-1 top-1 z-30 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                slot list
              </span>
            ) : null}
            {renderSlotPhantoms({ mode: slotPhantomMode })}
            <div
              className={
                stretchesSlotList
                  ? "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm"
                  : "relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-sm"
              }
            >
              <div className="relative z-10 shrink-0 px-5 pb-[clamp(14px,2vw,18px)] pt-[clamp(30px,4vw,40px)] sm:px-6">
                <motion.h2
                  layoutId="oh-modal-title"
                  layout="position"
                  transition={{
                    type: "spring",
                    ...(open ? openSpring : closeSpring),
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 1 }}
                  id={titleId}
                  className="m-0 max-w-[min(560px,100%)] font-[family-name:var(--font-grotesk)] text-[clamp(28px,4.4vw,34px)] font-black leading-[0.98] tracking-[-0.045em] text-[color:var(--oh-ink)] [text-wrap:balance]"
                >
                  {view === "form"
                    ? rescheduleFromUid
                      ? t("rescheduleFormTitle")
                      : t("bookingFormTitle")
                    : t("drawerTitle")}
                </motion.h2>
                <p className="sr-only">{t("drawerDescription")}</p>
              </div>
              {children}
            </div>
          </motion.div>
        </div>
      </HandleMorphCard>
    );
  }

  function renderDetailBody() {
    return (
      <>
        <div className="oh-drawer-monthbar">
          <span className="oh-drawer-monthbar-label">{monthBarLabel}</span>
          <button
            type="button"
            onClick={() => setView("month")}
            className="oh-focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] [-webkit-tap-highlight-color:transparent]"
            aria-label={t("openMonthViewAria")}
          >
            <CalendarIcon
              className="size-5 opacity-[0.7]"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </div>
        <div className="oh-drawer-body min-h-0 flex-1 overflow-y-auto">
          <motion.div
            key="strip"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={{ type: "spring", ...confirmSpring }}
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
                selectedSlot={selectedSlot}
              />
            ) : (
              <p className="oh-drawer-hint">— {t("tapDateHint")} —</p>
            )}
          </motion.div>
        </div>
      </>
    );
  }

  function renderFormBody() {
    return (
      <div className="pointer-events-auto relative z-30 px-5 pb-8 pt-2 sm:px-6">
        {selectedSlot ? (
          <BookingForm
            handle={handle}
            slotStart={selectedSlot.start}
            rescheduleFromUid={rescheduleFromUid}
          />
        ) : null}
      </div>
    );
  }

  function renderMonthBody() {
    return (
      // B.PT249 — wrapper is `flex flex-col` so MonthCalendar's
      // own `flex min-h-0 flex-1 flex-col` resolves against a flex
      // parent. Without it, MonthCalendar collapsed to content
      // height, the Radix Viewport's `size-full` matched that
      // natural height, no overflow registered, and ScrollArea
      // reported no scrollable area — wheel events fired but had
      // nothing to scroll. /t works because its parent is
      // `flex h-[500px] flex-col`. The B.PT241–B.PT248 trail
      // chased phantom-layer + FocusOn culprits; the actual break
      // was the height chain.
      <div className="pointer-events-auto relative z-30 flex min-h-0 flex-1 flex-col overflow-hidden">
        <MonthCalendar
          slots={slots}
          selectedDate={selectedDate}
          onSelectDate={handleMonthPick}
          months={months}
        />
      </div>
    );
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
      // B.PT247 — `scrollLock={false}` disables `react-remove-scroll`
      // entirely (FocusOn wraps it conditionally on `enabled &&
      // scrollLock`). `noIsolation` alone (B.PT244) wasn't enough —
      // RemoveScroll has multiple wheel/touch interception paths
      // beyond the document-level capture; the wrapper component
      // also intercepts events on its own subtree. Disabling
      // scroll-lock entirely sidesteps every path. Safe because the
      // visitor shell's `:where(html, body):has(.oh-visitor-shell)
      // { overflow: hidden }` rule (B.PT217) already locks body
      // scroll without RemoveScroll. /t demo confirmed the inner
      // Radix ScrollArea works in isolation; the modal-only break
      // pointed at FocusOn's RemoveScroll wrapper.
      scrollLock={false}
      // B.PT165 — when the Leva debug panel is mounted (?debug=1 in
      // dev), pass its container ref as a shard so clicks/focus on
      // the panel are treated as "inside" the modal: no
      // onClickOutside fires when sliding a control, focus trap
      // doesn't pull tab back from the panel, scroll-lock doesn't
      // disable wheel events on the panel. Production (no debug):
      // `panelShardRef` is null → empty array → no-op.
      shards={panelShardRef ? [panelShardRef] : undefined}
    >
      {/* Backdrop — fades in/out with the modal. Outside the
          motion.article so it doesn't participate in the layoutId
          morph. Click is handled by FocusOn's onClickOutside above.
          B.PT194 — backdrop scrim REMOVED per user request. The
          paper-on-page contrast is sufficient without dimming the
          page beneath; the modal's inner shadow + cream-vs-paper
          contrast already define its edge. Removing the scrim also
          makes the inspect-mode dual-layer view cleaner (landing
          card behind isn't obscured by a 40% ink overlay). */}

      {/* Modal card — shares `layoutId` with the landing card so motion
          auto-morphs between 385×387 (landing) and the modal's measured
          rect. `transition` switches to CLOSE_SPRING when the parent
          flips `open` to false; motion picks up the prop on the next
          render so the closing animation uses the dismissed-spring
          curve from Figma. Centered via flex parent. */}
      <motion.div
        layoutRoot
        role="dialog"
        aria-modal="true"
        aria-labelledby={currentTitleId}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === "month"
            ? renderCardShell({
                keyName: "month-card",
                titleId: monthTitleId,
                className: "h-full max-h-[1158px] max-w-[720px] overflow-hidden",
                slotPhantomMode: "measure",
                children: renderMonthBody(),
              })
            : view === "form"
              ? renderCardShell({
                  keyName: "form-card",
                  titleId: formTitleId,
                  className:
                    "min-h-[min(calc(100dvw-32px),450px)] w-[min(calc(100dvw-32px),450px)] max-w-none overflow-hidden sm:min-h-[min(calc(100dvw-64px),450px)] sm:w-[min(calc(100dvw-64px),450px)]",
                  slotPhantomMode: "measure",
                  sizing: "square",
                  children: renderFormBody(),
                })
            : renderCardShell({
                keyName: "detail-card",
                titleId: detailTitleId,
                className:
                  "min-h-[clamp(500px,70dvh,900px)] max-w-[720px] overflow-hidden",
                slotPhantomMode: "visible",
                children: renderDetailBody(),
              })}
        </AnimatePresence>
      </motion.div>
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
