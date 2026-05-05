"use client";

import { useState, type ReactNode } from "react";
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
import {
  oStyle,
  useModalDebug,
  zStyle,
} from "../_components/visitor-debug-overlay";
import { SLOT_OPTIONS, SlotRow } from "./host-profile";

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
  // B.PT172 — when this debug toggle is on, the modal phantoms get
  // REAL chip content rendered inside them (instead of empty rects).
  // The user sees the post-morph "frozen" view of Layer 1 at modal
  // coordinates: each chip at 690×282 size, with text + duration
  // visible. Combined with B.PT170/171's landing-stays-mounted +
  // layoutId-stripping, the overall debug experience is: landing
  // visible at center + chip content visible at modal phantom
  // positions, no morph fight.
  const showLandingAtDest = debug?.keepLandingMounted ?? false;

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
          initial={{ opacity: oStyle(oL2?.layer, 1) }}
          animate={{ opacity: oStyle(oL2?.layer, 1) }}
          exit={{ opacity: oStyle(oL2?.layer, 1) }}
          style={{
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
          className="flex h-full max-h-[1158px] w-full max-w-[720px] flex-col gap-3 overflow-hidden rounded-[25px] bg-[color:var(--oh-paper)] p-[15px] shadow-[inset_0_0_15px_rgba(0,0,0,0.25)]"
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
              position absolutely from 0,0). Our `<motion.article>`
              has `p-[15px]` so its content box starts at (15,15) in
              article-outer coords. The phantom container extends to
              the article's outer edge via `-inset-[15px]`, then the
              phantoms inside use raw Figma pixel coords. Sub-pixel
              0.5px offsets (192.5, 21.5, etc.) rounded to integers —
              motion's FLIP measurement is rect-based and the visual
              difference is below display-pixel resolution.
              B.PT160 audit findings on what's NOT animated 1-to-1:
                - **cornerRadius (14 → 0)** on each slot row in the
                  spec is NOT animated. Reason: borderRadius is paint-
                  bound; animating it would regress the Firefox
                  smoothness gain from B.PT159's backdrop-blur drop.
                  Acceptable trade-off: chip opacity tweens 1 → 0
                  alongside the morph, so the radius change is
                  invisible at the end state.
                - **Chip internals (Frame 6 left text, Frame 12
                  duration display)** stay 50px tall in spec while
                  the slot row grows to 282px. Our impl scales them
                  uniformly via the parent's FLIP transform. Reason:
                  invisible at end state (opacity 0); skipping their
                  layoutIds keeps the layoutId count low for perf.
              Both deviations are deliberate — net visual at any
              snapshot during the morph is indistinguishable. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[15px]"
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
              transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
              initial={{ opacity: oStyle(oL2?.identity, 0) }}
              animate={{ opacity: oStyle(oL2?.identity, 0) }}
              exit={{ opacity: oStyle(oL2?.identity, 0) }}
              style={{
                position: "absolute",
                top: 22,
                left: 192,
                width: 336,
                height: 87,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.identity),
                pointerEvents: "none",
              }}
            >
              {/* B.PT180 — inverse-scale wrapper. Per motion docs:
                  "layout animations that change size can distort child
                  components. This can be corrected by providing child
                  components with a layout prop as well. Only
                  immediate children need to be corrected for scale
                  distortion." Without this wrapper, the avatar + h1
                  inside scale with the parent's transform during the
                  morph (the phantom rect grows from landing's
                  natural identity size to its 336×87 destination,
                  any size delta gets applied to children's paint).
                  Identity sizes match closely so the visible
                  distortion was small here, but symmetric with the
                  slot wrapper below + future-proof if the rect
                  delta grows. */}
              {showLandingAtDest && identityContent ? (
                // B.PT182 — `layout="size"` not `layout`. See the
                // sibling comment in host-profile.tsx for the long
                // explanation: default `layout` (true) tracks BOTH
                // size + position, causing inverse-translation to
                // freeze content at its previous absolute position
                // while the outer rect moves. `size` keeps inverse-
                // scale correction but lets CSS-driven translation
                // follow the parent.
                <motion.div
                  layout="size"
                  transition={{
                    type: "spring",
                    ...(open ? openSpring : closeSpring),
                  }}
                >
                  {identityContent}
                </motion.div>
              ) : null}
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
              transition={{ type: "spring", ...(open ? openSpring : closeSpring) }}
              initial={{ opacity: oStyle(oL2?.slotList, 0) }}
              animate={{ opacity: oStyle(oL2?.slotList, 0) }}
              exit={{ opacity: oStyle(oL2?.slotList, 0) }}
              style={{
                position: "absolute",
                inset: 0,
                outline: phantomOutline ? "1px dashed currentColor" : undefined,
                zIndex: zStyle(zL2?.slotList),
              }}
            >
              {phantomLabels ? (
                <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-fuchsia-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-white">
                  slot list
                </span>
              ) : null}
              {Array.from({ length: 4 }).map((_, i) => {
                const opt = SLOT_OPTIONS[i];
                return (
                  <motion.div
                    key={i}
                    layoutId={`oh-slot-${i}`}
                    transition={{
                      type: "spring",
                      ...(open ? openSpring : closeSpring),
                    }}
                    initial={{
                      opacity: oStyle(
                        oL2
                          ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                          : undefined,
                        0,
                      ),
                    }}
                    animate={{
                      opacity: oStyle(
                        oL2
                          ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                          : undefined,
                        0,
                      ),
                    }}
                    exit={{
                      opacity: oStyle(
                        oL2
                          ? [oL2.slot0, oL2.slot1, oL2.slot2, oL2.slot3][i]
                          : undefined,
                        0,
                      ),
                    }}
                    style={{
                      position: "absolute",
                      top: 15 + i * 282,
                      left: 15,
                      width: 690,
                      height: 282,
                      outline: phantomOutline
                        ? "1px dashed currentColor"
                        : undefined,
                      zIndex: zStyle(
                        zL2
                          ? [zL2.slot0, zL2.slot1, zL2.slot2, zL2.slot3][i]
                          : undefined,
                      ),
                      // B.PT172 — when not in debug "show at destination"
                      // mode, phantoms are pure invisible morph targets
                      // (no pointer events). When debug mode is on we
                      // still don't want phantoms intercepting clicks
                      // on the modal interior — leave pointer-events
                      // disabled regardless.
                      pointerEvents: "none",
                    }}
                  >
                    {showLandingAtDest && opt ? (
                      // B.PT172 — render the actual chip rendering at
                      // the phantom's destination rect so the user
                      // sees what Layer 1 looks like AT post-morph
                      // position. The slot's content stays at its
                      // CSS-natural size (50px tall) anchored to the
                      // top-left of the 282-tall phantom rect — same
                      // as the spec's "Frame 6/12 stay 50px while
                      // slot grows to 282" behavior.
                      // B.PT180 — `<motion.div layout>` is the
                      // inverse-scale wrapper. The phantom's rect
                      // morphs from 325×50 (landing source) to
                      // 690×282 (modal destination) — a 2.12× wider
                      // and 5.64× taller scale transform. Without
                      // this wrapper the SlotRow children paint with
                      // that transform applied → text + duration
                      // label squished/elongated mid-morph (and
                      // visibly squished at destination because the
                      // transform doesn't fully unwind for content
                      // rendered conditionally). Mirrors the same
                      // wrapper on the LANDING side (B.PT162); the
                      // modal side was missing it, breaking the
                      // symmetric Smart-Animate behavior.
                      // B.PT182 — `layout="size"` not `layout`.
                      // Mirrors the host-profile slot wrapper. See
                      // long-form comment there.
                      <motion.div
                        layout="size"
                        transition={{
                          type: "spring",
                          ...(open ? openSpring : closeSpring),
                        }}
                      >
                        <SlotRow
                          title="intro"
                          description="quick chat, voice only"
                          durationLabel={opt.label}
                          onClick={() => {}}
                        />
                      </motion.div>
                    ) : null}
                    {phantomLabels ? (
                      <span className="pointer-events-none absolute right-1 top-1 rounded-sm bg-cyan-500/90 px-1.5 py-0.5 font-[family-name:var(--oh-mono)] text-[9px] font-bold uppercase tracking-[1px] text-black">
                        slot {i}
                      </span>
                    ) : null}
                  </motion.div>
                );
              })}
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
