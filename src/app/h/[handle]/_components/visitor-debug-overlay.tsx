"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useSearchParams } from "next/navigation";
import { folder, Leva, useControls } from "leva";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";

// B.PT164 (init) → B.PT173 (simplification). Mounts at the
// `/h/[handle]/layout.tsx` level; gates to dev + `?debug=1`.
//
// B.PT173 reduced the panel from ~30 individual controls (per-element
// z-index + opacity sliders, an outline toggle, a "keep landing
// mounted" toggle, a panel-z preset, 14 Layer-N sliders…) down to a
// **mode dropdown** + one conditional opacity slider + a collapsed
// spring-tuning folder. The full ModalDebugValues consumer contract is
// synthesized in-memo so `<HostProfile>` and `<HandleModal>` don't
// change. Reasoning: the per-element knobs were exploration scaffolding
// — by B.PT172 the right answer (frozen-at-destination + readable
// chip content) was settled and the granular controls became dead UI.

const SPEC_OPEN = animSpec.transitions[0].spring;
const SPEC_CONFIRM =
  animSpec.transitions.find(
    (t) =>
      t.from?.name === "handle-detail" &&
      t.to?.name === "handle-detail" &&
      t.from?.id !== t.to?.id,
  )?.spring ?? animSpec.transitions[1].spring;
const SPEC_CLOSE =
  animSpec.transitions.find(
    (t) => t.from?.name === "handle-detail" && t.to?.name === "handle",
  )?.spring ?? animSpec.transitions[2].spring;

// B.PT178 — union so spring tuning can drive EITHER physics OR a
// target visual duration. Per Context7-verified motion docs:
// `visualDuration` (seconds to visually reach target) + `bounce`
// (0-1) override physics; "Bounce and duration are overridden if
// stiffness, damping, or mass are set." So the transition object
// must contain ONLY one shape — we never pass physics keys when
// duration mode is on. Shapes have no discriminator field; consumer
// narrows via `'visualDuration' in spring` so the spread into
// motion's transition object is clean (no stray fields).
type SpringValues =
  | {
      mass: number;
      stiffness: number;
      damping: number;
      velocity: number;
    }
  | {
      visualDuration: number;
      bounce: number;
      velocity: number;
    };

type ZBlock = {
  layer: number;
  identity: number;
  slotList: number;
  slot0: number;
  slot1: number;
  slot2: number;
  slot3: number;
};

type OBlock = {
  layer: number;
  identity: number;
  slotList: number;
  slot0: number;
  slot1: number;
  slot2: number;
  slot3: number;
};

export type ModalDebugValues = {
  /** When true, render a 1px dashed outline around each phantom. Set
   *  by the `outline` mode preset. */
  showPhantomOutline: boolean;
  /** B.PT176 — when true, overlay each phantom rect with a small text
   *  label naming the element ("identity", "slot list", "slot 0",
   *  etc.) so the user can identify which phantom is at which
   *  position on screen. Useful in inspect mode for diagnosis. */
  showPhantomLabels: boolean;
  /** When true, the landing card stays mounted alongside the modal
   *  with its layoutIds stripped, and the modal phantoms render real
   *  chip content (frozen at destination). Set by the `inspect` mode. */
  keepLandingMounted: boolean;
  openSpring: SpringValues;
  closeSpring: SpringValues;
  confirmSpring: SpringValues;
  /** All values default to 0 — no inline z-index override. */
  zLayer1: ZBlock;
  zLayer2: ZBlock;
  /** Layer 1 (landing) defaults to 1 (visible). Layer 2's `layer` is
   *  the modal article (1, visible); the phantom children
   *  (identity / slotList / slot0..3) default to 0 (invisible) in
   *  production and inspect-mode raises them per the per-element
   *  sliders. */
  oLayer1: OBlock;
  oLayer2: OBlock;
};

/** Map a Leva slider value (0 = unset) to a CSS `z-index` value or
 *  undefined. Use as: `style={{ zIndex: zStyle(debug?.zLayer1.layer) }}`. */
export function zStyle(v: number | undefined): number | undefined {
  if (v === undefined || v === 0) return undefined;
  return v;
}

/** Map a Leva opacity slider (0..1) to a style.opacity value, falling
 *  back to the production default when the debug context is null. */
export function oStyle(v: number | undefined, fallback: number): number {
  return v ?? fallback;
}

type ModalDebugContextValue = {
  values: ModalDebugValues | null;
  /** Ref to the DOM container holding the Leva panel. Passed via
   *  context so `<HandleModal>`'s `<FocusOn>` treats the panel as
   *  inside the modal scope (no onClickOutside fires when clicking
   *  a slider). null when debug is disabled. */
  panelShardRef: RefObject<HTMLDivElement | null> | null;
};

const ModalDebugContext = createContext<ModalDebugContextValue>({
  values: null,
  panelShardRef: null,
});

const DISABLED_DEBUG_CONTEXT: ModalDebugContextValue = {
  values: null,
  panelShardRef: null,
};

/** Read debug overrides from the page-level overlay. Returns `null`
 *  values in production / when `?debug=1` is absent — consumers fall
 *  back to spec defaults. */
export function useModalDebug() {
  return useContext(ModalDebugContext);
}

const NO_Z: ZBlock = {
  layer: 0,
  identity: 0,
  slotList: 0,
  slot0: 0,
  slot1: 0,
  slot2: 0,
  slot3: 0,
};

const LAYER1_PROD_O: OBlock = {
  layer: 1,
  identity: 1,
  slotList: 1,
  slot0: 1,
  slot1: 1,
  slot2: 1,
  slot3: 1,
};

const LAYER2_PROD_O: OBlock = {
  layer: 1, // modal article — has real content, visible
  identity: 0,
  // B.PT195 — slot-list visible in production (was 0). The phantom
  // slot-list is the cream container with `inset 0 0 4px rgba(0,0,
  // 0,0.25)` inner shadow that morphs from landing's cream card.
  // Keeping it visible in production preserves the closed-state's
  // nested-card aesthetic in the open state — paper modal article
  // (outer) + cream slot-list (inner) with concentric inner shadows.
  // Slot-list expands during the morph the same way the chip
  // morphs expand. Slot phantoms inside (slot0..3) stay at 0 so
  // we don't see the chip rectangles in production.
  slotList: 1,
  slot0: 0,
  slot1: 0,
  slot2: 0,
  slot3: 0,
};

export function VisitorDebugOverlay({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";

  if (!enabled) {
    return (
      <ModalDebugContext.Provider value={DISABLED_DEBUG_CONTEXT}>
        {children}
      </ModalDebugContext.Provider>
    );
  }

  return <EnabledVisitorDebugOverlay>{children}</EnabledVisitorDebugOverlay>;
}

function EnabledVisitorDebugOverlay({ children }: { children: ReactNode }) {
  const panelShardRef = useRef<HTMLDivElement | null>(null);

  // Schema lives at the root (no namespace prefix) so Leva's `get()`
  // path inside `render` callbacks is the bare control key — the
  // documented pattern (`get('mode')` instead of a fully-qualified
  // path). Spring tuning is a folder so it can collapse independently.
  const ctrls = useControls(
    {
      mode: {
        // B.PT185 — default flipped from "production" to "inspect" so
        // a fresh `?debug=1` load drops directly into the dual-layer
        // inspection workflow (which is the whole point of the panel
        // existing at all). Switch back to "production" via the
        // dropdown to verify the live morph plays as expected.
        value: "inspect",
        options: ["production", "inspect", "outline"] as const,
        label: "mode",
        hint:
          "production = real animation; inspect = frozen post-morph view (chip content rendered at destination rects, landing kept mounted); outline = dashed outline around phantom rects so you can see where motion is targeting.",
      },
      // B.PT176 — replaced the single `phantomOpacity` master with
      // per-element sliders. The master was hiding a bug: synthesis
      // hardcoded `oLayer2.slotList = 0` while the slot-list phantom
      // is the PARENT of slot0..3 in the DOM. CSS opacity composes
      // multiplicatively, so children at opacity=1 inside a parent
      // at 0 render at effective 0 → user couldn't see chips even
      // though their slider was at 1. Per-element sliders let the
      // user (and future-debugger) see WHICH phantom is hidden and
      // by what.
      identityOpacity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.05,
        label: "identity opacity",
        hint:
          "Modal identity-phantom rect (336×87 at 192,22). Renders avatar + name when keepLandingMounted is on.",
        render: (get) => get("mode") === "inspect",
      },
      slotListOpacity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.05,
        label: "slot-list opacity",
        hint:
          "Slot-list phantom is the PARENT of the 4 slot phantoms. CSS opacity composes multiplicatively — set this to 0 and the slot chips disappear regardless of their own opacity.",
        render: (get) => get("mode") === "inspect",
      },
      slotsOpacity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.05,
        label: "slots opacity",
        hint:
          "All 4 slot-row phantoms (uniform). Renders the SlotRow content at destination size 690×282 when keepLandingMounted is on.",
        render: (get) => get("mode") === "inspect",
      },
      showLabels: {
        value: false,
        label: "show element labels",
        hint:
          "Overlay each phantom rect with a small text label naming the element ('identity' / 'slot list' / 'slot 0..3'). Helps identify which phantom is rendering at which position when something looks wrong.",
        render: (get) => get("mode") === "inspect",
      },
      // B.PT174 — bring the landing card above the modal during the
      // morph's final state. Production stacking has the modal on top
      // (fixed wrapper baked at `z-50`); flipping to "landing on top"
      // raises the landing's article to z=100 with position:relative
      // so it competes in the same stacking context. Useful for
      // inspecting Layer 1 over Layer 2 (which the user couldn't do
      // after the B.PT173 prune dropped per-element z sliders).
      stackOrder: {
        value: "modal on top",
        options: ["modal on top", "landing on top"] as const,
        label: "stack order",
        hint:
          "modal on top = production stacking (modal's z-50 wrapper covers the landing). landing on top = lift the landing card to z=100 so Layer 1 renders over Layer 2 — most useful while inspect mode keeps both mounted.",
      },
      "Spring tuning": folder(
        {
          openMass: { value: SPEC_OPEN.mass, min: 0.1, max: 10, step: 0.1 },
          openStiffness: { value: SPEC_OPEN.stiffness, min: 1, max: 1000, step: 1 },
          openDamping: { value: SPEC_OPEN.damping, min: 0, max: 100, step: 0.1 },
          openVelocity: { value: SPEC_OPEN.velocity, min: -50, max: 50, step: 0.5 },
          confirmMass: { value: SPEC_CONFIRM.mass, min: 0.1, max: 10, step: 0.1 },
          confirmStiffness: { value: SPEC_CONFIRM.stiffness, min: 1, max: 1000, step: 1 },
          confirmDamping: { value: SPEC_CONFIRM.damping, min: 0, max: 100, step: 0.1 },
          confirmVelocity: { value: SPEC_CONFIRM.velocity, min: -50, max: 50, step: 0.5 },
          closeMass: { value: SPEC_CLOSE.mass, min: 0.1, max: 10, step: 0.1 },
          closeStiffness: { value: SPEC_CLOSE.stiffness, min: 1, max: 1000, step: 1 },
          closeDamping: { value: SPEC_CLOSE.damping, min: 0, max: 100, step: 0.1 },
          closeVelocity: { value: SPEC_CLOSE.velocity, min: -50, max: 50, step: 0.5 },
          // B.PT178 — duration override. Per motion docs,
          // `visualDuration` (seconds to visually reach target) +
          // `bounce` (0-1) override the physics keys above. We pass
          // EITHER physics OR duration into the transition object,
          // never both, because motion's rule is "physics wins when
          // both are set." Sentinel: visualDuration === 0 means
          // "use physics"; >0 means "use duration".
          visualDuration: {
            value: 0,
            min: 0,
            max: 3,
            step: 0.05,
            label: "duration (s)",
            hint:
              "Time the spring takes to visually reach target. 0 = use physics (mass/stiffness/damping above). Any value > 0 overrides the physics for ALL three springs (open/confirm/close) — drop physics keys, pass {visualDuration, bounce} instead.",
          },
          bounce: {
            value: 0.25,
            min: 0,
            max: 1,
            step: 0.05,
            label: "bounce",
            hint:
              "Bounciness of the spring (0 = critically damped, 1 = very bouncy). Only applies when duration > 0. Default 0.25 reads as a gentle settle.",
          },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

  const value = useMemo<ModalDebugValues | null>(() => {
    const inspect = ctrls.mode === "inspect";
    const outline = ctrls.mode === "outline";
    const landingOnTop = ctrls.stackOrder === "landing on top";

    // Modal wrapper bakes z-50 in CSS; lift landing to 100 so it
    // wins the stacking comparison against the modal's z-50 fixed
    // wrapper. host-profile.tsx pairs this with position:relative
    // so the zIndex actually applies (CSS spec: zIndex only takes
    // effect on positioned elements).
    const zL1: ZBlock = landingOnTop
      ? { ...NO_Z, layer: 100 }
      : NO_Z;

    // B.PT176 — slot-list is the DOM parent of slot0..3. Setting
    // it to anything < 1 zeroes out the children's effective opacity
    // multiplicatively (CSS opacity). User reported chips invisible
    // even with slot opacity at 1; root cause was the prior synthesis
    // hardcoding `oLayer2.slotList = 0`. Now driven by the explicit
    // slot-list slider (default 1 in inspect mode).
    const slots = ctrls.slotsOpacity;

    // B.PT178 — duration override. When visualDuration > 0, all
    // three springs use {visualDuration, bounce, velocity (per
    // spring)} instead of physics. Per motion docs the duration
    // keys override physics — so the transition object has to
    // contain only one shape. Velocity is preserved per-spring
    // because it isn't overridden by duration mode (physics-only
    // keys are mass/stiffness/damping).
    const useDuration = ctrls.visualDuration > 0;
    const springFor = (
      mass: number,
      stiffness: number,
      damping: number,
      velocity: number,
    ): SpringValues =>
      useDuration
        ? {
            visualDuration: ctrls.visualDuration,
            bounce: ctrls.bounce,
            velocity,
          }
        : { mass, stiffness, damping, velocity };

    return {
      showPhantomOutline: outline,
      showPhantomLabels: inspect && ctrls.showLabels,
      keepLandingMounted: inspect,
      openSpring: springFor(
        ctrls.openMass,
        ctrls.openStiffness,
        ctrls.openDamping,
        ctrls.openVelocity,
      ),
      confirmSpring: springFor(
        ctrls.confirmMass,
        ctrls.confirmStiffness,
        ctrls.confirmDamping,
        ctrls.confirmVelocity,
      ),
      closeSpring: springFor(
        ctrls.closeMass,
        ctrls.closeStiffness,
        ctrls.closeDamping,
        ctrls.closeVelocity,
      ),
      zLayer1: zL1,
      zLayer2: NO_Z,
      oLayer1: LAYER1_PROD_O,
      oLayer2: inspect
        ? {
            layer: 1,
            identity: ctrls.identityOpacity,
            slotList: ctrls.slotListOpacity,
            slot0: slots,
            slot1: slots,
            slot2: slots,
            slot3: slots,
          }
        : LAYER2_PROD_O,
    };
  }, [
    ctrls.mode,
    ctrls.identityOpacity,
    ctrls.slotListOpacity,
    ctrls.slotsOpacity,
    ctrls.showLabels,
    ctrls.stackOrder,
    ctrls.openMass,
    ctrls.openStiffness,
    ctrls.openDamping,
    ctrls.openVelocity,
    ctrls.confirmMass,
    ctrls.confirmStiffness,
    ctrls.confirmDamping,
    ctrls.confirmVelocity,
    ctrls.closeMass,
    ctrls.closeStiffness,
    ctrls.closeDamping,
    ctrls.closeVelocity,
    ctrls.visualDuration,
    ctrls.bounce,
  ]);

  return (
    <ModalDebugContext.Provider
      value={{ values: value, panelShardRef }}
    >
      <div
        ref={panelShardRef}
        data-oh-debug-panel=""
        style={{ position: "relative", zIndex: 200 }}
      >
        <Leva collapsed={false} oneLineLabels />
      </div>
      {children}
    </ModalDebugContext.Provider>
  );
}
