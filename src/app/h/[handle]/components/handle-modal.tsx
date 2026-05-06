"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FocusOn } from "react-focus-on";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeftIcon, CalendarIcon, XIcon } from "lucide-react";
import {
  BookingForm,
  DayStrip,
  DaySlots,
  MonthDrawer,
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
} from "./host-profile";

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

  // B.PT164 / B.PT165 — debug overrides come from the route-level
  // overlay mounted in `/h/[handle]/layout.tsx` via React Context.
  // `values` is null in production / when `?debug=1` is absent — fall
  // back to spec defaults. `panelShardRef` (B.PT165) gets passed to
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
  // modal article + each phantom destination. Defaults: zIndex
  // undefined (no inline z), opacity 1 for the modal article + 0 for
  // phantoms (production behavior). The retired `phantomOpacity`
  // field still sets `oLayer2.identity` for back-compat (a unified
  // "show all phantoms" toggle is now the per-element sliders).
  const zL2 = debug?.zLayer2;
  const oL2 = debug?.oLayer2;
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
        aria-labelledby="handle-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      >
        <motion.article
          layoutId="handle-card"
          transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
          // B.PT159: hint the compositor that we'll be transforming
          // this element. Motion sets `transform` itself but `will-
          // change: transform` lets the browser promote the layer
          // pre-emptively, smoothing the very first frame on
          // Firefox where the layer otherwise gets created mid-
          // animation. Removed after layout settles via
          // `onLayoutAnimationComplete` so the layer doesn't stay
          // hot when idle.
          // B.PT169 — explicit `animate` + `exit` opacity overrides
          // motion's auto layoutId crossfade (which would otherwise
          // tween the modal article's opacity to match the
          // crossfade target). Slider value wins.
          // B.PT181 — initial matches animate so motion doesn't run
          // an opacity fade-in on phantom mount. Without this, motion
          // treats the freshly-mounted layoutId element as "entering"
          // and tweens opacity from 0 → animate target — visible as
          // a "clone fades in beside the source" alongside the
          // ongoing FLIP. With initial = animate, phantom enters at
          // its target opacity, no extra crossfade tween, and the
          // morph reads as a single element transitioning (matches
          // Figma's Smart-Animate behavior).
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
            ...HANDLE_CARD_RADIUS_STYLE,
            boxShadow: "inset 0 0 15px rgba(0,0,0,0.25)",
            willChange: "transform",
            zIndex: zStyle(zL2?.layer),
          }}
          // B.PT160 — `max-h-[1158px]` matches the Figma frame's natural
          // height (the modal frame is exactly 720×1158 in the spec).
          // Was `max-h-[800px]` from B.PT156; that capped the slot-list
          // phantom morph short of its target rect on tall viewports.
          // Most real viewports are < 1158 tall so practical UX
          // unchanged (the parent `fixed inset-0 ... p-4 sm:p-8`
          // wrapper clamps to viewport-minus-padding); only impact is
          // tall ≥1158px monitors where the modal can now reach its
          // exact Figma size for full 1-to-1 phantom positioning.
          // B.PT161 — Figma Frame 1 has NO stroke; only the inner
          // shadow defines the modal's edge against the dark backdrop.
          // Removed `border border-oh-line` from B.PT156 to match.
          // B.PT202 / B.PT203 — modal article padding REMOVED. The
          // 15px inset is now applied directly to the slot-list
          // phantom via `inset: 15` so it ONLY affects the
          // absolutely-positioned phantom layer behind the window.
          // The calendar content (z-10) keeps its full inner area
          // untouched.
          className="flex h-full max-h-[1158px] w-full max-w-[720px] flex-col overflow-hidden bg-[color:var(--oh-paper)]"
        >
          {/* B.PT159 / B.PT160 — PHANTOM destinations matching the
              Figma spec EXACTLY. The user designed the modal with
              phantom (opacity 0) copies of the slot rows + identity
              header at their target positions inside frame 2. Per
              `docs/figma/anim-h-handle-redesign.json` transition[0]
              deltas:
                - Frame 15 (identity)  pos (192.5, 21.5), size 336×87
                - Frame 2  (slot list) pos (0.5, -0.5),   size 720×1158
                - Frame 18 (inner)     pos (15, 15),      size 690×1128
                - Slot rows (× 4)      pos (0, 0|282|564|846), size 690×282
              These coordinates are relative to the modal frame's
              outer edge (Figma frames have no padding; children
              position absolutely from 0,0). The article has no
              padding; the phantom layer is `inset-0`, and the
              phantoms inside use raw Figma pixel coords including
              sub-pixel offsets like 192.5 / 21.5.

              The slot path mirrors the Figma layer hierarchy:
                - `oh-slot-list` = Frame 2 cream container.
                - `oh-slot-stack` = Frame 18 inner stack.
                - `oh-slot-N` = each painted slot frame, with
                  borderRadius 14 → 0 and size 325×50 → 690×282.

              The one accepted approximation is inside the slot:
              Frame 9 grows 303 → 668 wide while its 50px height stays
              fixed. SlotRow keeps that layer as a projected
              `motion.span layout` anchored top-left, then projects the
              text groups with `layout="position"` so the row width
              follows fill-container behavior without scaling the text. */}
          <div
            aria-hidden
            // B.PT195 — phantom container moved to z-0 so the
            // cream slot-list phantom (now visible in production)
            // sits BEHIND the calendar content (z-10). Identity
            // phantom and slot phantoms also drop to z-0; both are
            // at opacity 0 in production so this doesn't affect
            // their visibility, only their stacking with calendar.
            className="pointer-events-none absolute inset-0 z-0"
          >
            {/* Identity header phantom — exact Figma coords (192, 22)
                with size 336×87. B.PT175 — when the debug overlay
                passes `identityContent` (avatar + h1 from the parent),
                render it inside so the user can see the title/avatar
                at its post-morph destination. Without content the
                phantom is an empty rect and the destination identity
                is invisible. Pair with `pointerEvents: "none"` so the
                phantom can never intercept clicks on the modal
                interior. */}
            <motion.div
              layoutId="oh-identity"
              transition={{
                type: "spring",
                ...(open ? openSpring : closeSpring),
              }}
              initial={{ opacity: oStyle(oL2?.identity, 0) }}
              animate={{ opacity: oStyle(oL2?.identity, 0) }}
              exit={{ opacity: oStyle(oL2?.identity, 0) }}
              style={{
                position: "absolute",
                top: 21.5,
                left: 192.5,
                width: 336,
                height: 87,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.identity),
                pointerEvents: "none",
              }}
            >
              {/* Identity content is supplied with its own
                  `oh-identity-*` child layout IDs from
                  host-profile.tsx. The stripped Layer 1 row is hidden
                  after measurement, and the Layer 2 row/title/avatar
                  remain projected as one promoted clone. */}
              {identityContent ? identityContent : null}
              {phantomLabels ? (
                <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-amber-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
                  identity
                </span>
              ) : null}
            </motion.div>
            {/* Slot-list (Frame 2) phantom — full-modal coverage at
                (0, 0). The Frame 18 inner wrapper is 15px-margined
                inside it, then the 4 slot rows stack at exact Figma
                offsets (0/282/564/846, height 282 each, full width
                of Frame 18 = 690). */}
            <motion.div
              layoutId="oh-slot-list"
              transition={{
                type: "spring",
                ...(open ? openSpring : closeSpring),
              }}
              initial={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              animate={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              exit={{
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                opacity: oStyle(oL2?.slotList, 0),
              }}
              style={{
                // B.PT210 — `padding: 15` REMOVED from slot-list
                // (was added in B.PT207). The cream gutter now lives
                // only on slot-stack (mirrors landing motion.ul's
                // `p-[15px]`). Single source of truth for the inner
                // padding — no more compounding with slot-list's own
                // padding (was producing 30px total instead of 15px).
                // Slot-list keeps `inset: 15` of modal article so
                // paper is visible 15px around the cream rect.
                position: "absolute",
                inset: 15,
                ...HANDLE_SLOT_LIST_RADIUS_STYLE,
                boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.slotList),
              }}
              className="bg-[#F5EFDF]"
            >
              {phantomLabels ? (
                <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                  slot list
                </span>
              ) : null}
              <motion.div
                layoutId="oh-slot-stack"
                transition={{
                  type: "spring",
                  ...(open ? openSpring : closeSpring),
                }}
                style={{
                  // B.PT209 — padding mirrors landing's motion.ul
                  // `p-[15px]`. Shared `layoutId` only animates bbox;
                  // CSS doesn't transfer between landing and modal
                  // sides — both elements need matching styles for
                  // the gutter to look identical at landing AND modal
                  // target.
                  // B.PT207 holdover — slot-stack fills slot-list's
                  // padding box via `inset: 0`. Becomes a flex column
                  // so the 4 chip wrappers split height equally via
                  // `flex: 1`.
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  // Figma's Frame 18 has no fill/radius, only a drop shadow.
                  // Projecting that shadow reads as an unintended square
                  // wrapper around the chips; Frame 2 already paints the
                  // intended rounded shell.
                  boxShadow: "none",
                }}
                // B.PT211 — `padding: 15` moved from inline style to
                // Tailwind `p-[15px]` className for consistency with
                // landing's motion.ul which already uses the same
                // class. Same CSS at runtime, single styling
                // vocabulary across the morph.
                className="p-[15px]"
              >
                {Array.from({ length: 4 }).map((_, i) => {
                  const opt = SLOT_OPTIONS[i];
                  // B.PT213 — uniform concentric radius on all 4
                  // corners of every chip (was per-index in B.PT211
                  // — top of first + bottom of last → concentric,
                  // others → 0 sharp dividers). User asked to apply
                  // the same vocabulary to landing AND modal: "make
                  // all corners the same concentric value." Modal
                  // chips are still stacked edge-to-edge, but now
                  // each chip carries its own rounded outline (10px)
                  // — adjacent chips touch with visible curves
                  // rather than sharp dividers.
                  const slotRadiusStyle = cornerRadiusStyle(
                    HANDLE_SLOT_CONCENTRIC_OUTER_RADIUS,
                  );
                  return opt ? (
                    <div
                      key={i}
                      style={{
                        // B.PT207 — flex-1 so each wrapper takes
                        // equal share of slot-stack's height.
                        // `position: relative` + `minHeight: 0`
                        // makes the wrapper a positioning context
                        // for the chip's `inset: 0` and prevents
                        // flex from forcing min-content height.
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
                          // B.PT207 — chip fills its flex-1 wrapper
                          // via `inset: 0` (no hardcoded pixel dims).
                          // The wrapper takes 1/4 of slot-stack's
                          // height; slot-stack fills slot-list's
                          // padding box (660×1098). If the slot-list
                          // size or padding changes, chips resize
                          // automatically.
                          position: "absolute",
                          inset: 0,
                          // B.PT194 — Apple HIG concentric-corner
                          // formula: inner radius = outer radius -
                          // margin. Slot-list outer cornerRadius =
                          // 20, Frame 18 inner padding = 15, so
                          // inner radius = 20 − 15 = 5. Apply only
                          // to the FIRST chip's TOP corners and the
                          // LAST chip's BOTTOM corners; middle chips
                          // stay sharp so the row dividers read as
                          // a clean segmented stack. Use explicit
                          // per-corner longhands instead of the
                          // borderRadius shorthand so Motion's
                          // shared-layout radius mixer interpolates
                          // from the real 14px source radius rather
                          // than a stale 0px corner value.
                          ...slotRadiusStyle,
                          boxShadow: "none",
                          outline: phantomOutline
                            ? "1px dashed currentColor"
                            : undefined,
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
            </motion.div>
          </div>
          {/* B.PT195 — calendar wrapper bg dropped from
              `bg-[color:var(--oh-paper)]` to transparent. The cream
              slot-list phantom now sits behind this layer (z-0)
              with its `inset 0 0 4px rgba(0,0,0,0.25)` inner shadow
              visible. Calendar content renders directly on the
              cream bg, mirroring how landing's slot-list cream
              card hosts the chips directly on cream. */}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("closeDrawerAria")}
              className="oh-focus-ring absolute right-[14px] top-[14px] z-10 inline-flex size-7 items-center justify-center rounded-[2px] bg-[color:var(--oh-paper)] text-[color:var(--oh-ink)] transition-colors duration-150 ease-oh hover:bg-[color:var(--oh-ink)] hover:text-[color:var(--oh-paper)]"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
            <div className="oh-modal-close-bar" aria-hidden />
            <div className="oh-drawer-head">
              <h2 id="handle-modal-title" className="oh-drawer-title">
                {view === "form"
                  ? rescheduleFromUid
                    ? t("rescheduleFormTitle")
                    : t("bookingFormTitle")
                  : t("drawerTitle")}
              </h2>
              <p className="sr-only">{t("drawerDescription")}</p>
            </div>

            {/* monthbar — picker view only. In form view it's hidden +
                replaced by a back-to-picker control. Same `oh-drawer-
                monthbar` class so existing CSS still applies. */}
            {view === "picker" ? (
              <div className="oh-drawer-monthbar">
                <span className="oh-drawer-monthbar-label">
                  {monthBarLabel}
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
                <span className="oh-drawer-monthbar-label truncate opacity-65">
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
                    // B.PT196 / B.PT197 — both `initial` and `exit`
                    // pinned to opacity 1 (matching `animate`). The
                    // picker/form motion.divs no longer fade in on
                    // mount nor fade out on unmount. AnimatePresence
                    // `mode="wait"` still serializes the swap (waits
                    // for the outgoing element to "exit" before the
                    // incoming one mounts), but with exit at opacity
                    // 1 the wait completes instantly. Net: no
                    // crossfade in either direction. Required because
                    // after B.PT195 the calendar wrapper's bg dropped
                    // (cream slot-list peeks through) so any 0→1 or
                    // 1→0 fade became visible against the cream bg.
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
                      />
                    ) : (
                      <p className="oh-drawer-hint">— {t("tapDateHint")} —</p>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    // B.PT196 / B.PT197 — both `initial` and `exit`
                    // pinned to opacity 1 (matching `animate`). The
                    // picker/form motion.divs no longer fade in on
                    // mount nor fade out on unmount. AnimatePresence
                    // `mode="wait"` still serializes the swap (waits
                    // for the outgoing element to "exit" before the
                    // incoming one mounts), but with exit at opacity
                    // 1 the wait completes instantly. Net: no
                    // crossfade in either direction. Required because
                    // after B.PT195 the calendar wrapper's bg dropped
                    // (cream slot-list peeks through) so any 0→1 or
                    // 1→0 fade became visible against the cream bg.
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 1 }}
                    transition={{ type: "spring", ...confirmSpring }}
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
          </div>
        </motion.article>
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
