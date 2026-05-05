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

// B.PT164 — Visitor surface debug overlay (Leva-based animation
// tweaking). Mounts at the `/h/[handle]/layout.tsx` level so it
// persists across every page in the route group (landing, modal
// states, booked confirmation, future sub-routes). Replaces B.PT163's
// page-root mount which only worked on the landing page.
//
// Two contracts in one component:
//   1. Renders the Leva UI panel + registers controls — gated to
//      `process.env.NODE_ENV === "development"` AND `?debug=1`. Zero
//      runtime cost in production (panel returns null; controls
//      register but no UI consumes them).
//   2. Provides debug values via React Context so any descendant
//      (`<HandleModal>` today, future visitor-page components later)
//      can read overrides without prop-drilling. `null` when the
//      panel is disabled — consumers fall back to the spec defaults.
//
// Ground truth for spring physics defaults: the JSON contract at
// `docs/figma/anim-h-handle-redesign.json`. Each control's default
// matches the spec exactly so opening the panel without touching
// anything reproduces production behavior. Slide a knob and watch
// the next animation use the new value.

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

export type ModalDebugValues = {
  /** Override the `opacity: 0` on phantom destinations. 0 = production
   *  behavior. 1 = phantoms stay visible after the morph completes,
   *  useful for inspecting where chips actually land. */
  phantomOpacity: number;
  /** When true, render a 1px dashed outline around each phantom so
   *  you can see where motion is targeting them even at opacity 0. */
  showPhantomOutline: boolean;
  /** When true, the layoutId-shared morph is bypassed for an A/B
   *  compare. NOTE: implementation in `<HandleModal>` reads this
   *  flag but the bypass is best-effort — most consumers can ignore. */
  disableMorph: boolean;
  /** B.PT170 — keep the landing card mounted while the modal is open.
   *  Strips its `layoutId` so it doesn't fight the modal's morph;
   *  user sees Layer 1 + Layer 2 simultaneously at their natural
   *  positions. Trade-off: the morph itself is bypassed in this mode
   *  (modal phantoms enter at their natural rect with no source). */
  keepLandingMounted: boolean;
  /** Spring physics — defaults read from the anim spec. */
  openSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  closeSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  confirmSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  /** B.PT167 — z-index overrides for SCENE elements (NOT the Leva
   *  panel itself — that's `panelZ` above). Value 0 means "no
   *  override" (use CSS default / no inline z-index); non-zero
   *  applies as `style.zIndex`. */
  zLayer1: {
    layer: number;
    identity: number;
    slotList: number;
    slot0: number;
    slot1: number;
    slot2: number;
    slot3: number;
  };
  zLayer2: {
    layer: number;
    identity: number;
    slotList: number;
    slot0: number;
    slot1: number;
    slot2: number;
    slot3: number;
  };
  /** B.PT168 — opacity overrides for SCENE elements. Replaces the
   *  blunter B.PT159 `phantomOpacity` slider (which only flipped the
   *  empty phantom rects' style.opacity — visible at 1 only as
   *  outlines because there's no content inside). Per-layer +
   *  per-element so the user can fade either side of the morph
   *  independently. Layer 1 (landing) defaults to 1.0 (visible);
   *  Layer 2 (modal phantoms) defaults to 0.0 (invisible — matches
   *  production). Range 0..1. */
  oLayer1: {
    layer: number;
    identity: number;
    slotList: number;
    slot0: number;
    slot1: number;
    slot2: number;
    slot3: number;
  };
  oLayer2: {
    layer: number;
    identity: number;
    slotList: number;
    slot0: number;
    slot1: number;
    slot2: number;
    slot3: number;
  };
};

/** Map a Leva slider value (0 = unset) to a CSS `z-index` value or
 *  undefined. Use as: `style={{ zIndex: zStyle(debug?.zLayer1.layer) }}`. */
export function zStyle(v: number | undefined): number | undefined {
  if (v === undefined || v === 0) return undefined;
  return v;
}

/** Map a Leva opacity slider (0..1) to a style.opacity value, falling
 *  back to the production default when the debug context is null.
 *  Use as: `style={{ opacity: oStyle(debug?.oLayer1.identity, 1) }}`.
 *  The fallback differs by element role:
 *   - Landing elements default to 1 (visible in production)
 *   - Modal phantom elements default to 0 (invisible in production) */
export function oStyle(v: number | undefined, fallback: number): number {
  return v ?? fallback;
}

type ModalDebugContextValue = {
  values: ModalDebugValues | null;
  /** Ref to the DOM container holding the Leva panel. `<HandleModal>`
   *  passes this as a `<FocusOn shards>` so clicks/focus on the panel
   *  don't trigger the modal's onClickOutside / focus-trap escape.
   *  null when debug is disabled. */
  panelShardRef: RefObject<HTMLDivElement | null> | null;
};

const ModalDebugContext = createContext<ModalDebugContextValue>({
  values: null,
  panelShardRef: null,
});

/** Read debug overrides from the page-level overlay. Returns `null`
 *  values in production / when `?debug=1` is absent — consumers fall
 *  back to spec defaults. Safe to call from any component inside the
 *  `/h/[handle]/*` route group. */
export function useModalDebug() {
  return useContext(ModalDebugContext);
}

/** Mount once at the `/h/[handle]/layout.tsx` level. Wraps children
 *  with the debug context provider + (in dev+debug mode) renders the
 *  Leva panel. */
export function VisitorDebugOverlay({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";
  // B.PT165 — ref to the Leva panel container. Passed via context so
  // `<HandleModal>`'s `<FocusOn>` treats interactions on the panel as
  // "inside" the modal scope (no onClickOutside fires when clicking a
  // slider; focus trap doesn't try to pull tab back from the panel).
  const panelShardRef = useRef<HTMLDivElement | null>(null);

  // Always register controls (React hook rules); only the consumer
  // contract gates on `enabled`. Leva caches duplicate registrations
  // by name + label — re-running on remount is fine.
  const ctrls = useControls(
    "Handle modal animation",
    {
      // B.PT168 — `phantomOpacity` retired. Replaced by per-element
      // opacity controls in the Layer 1 / Layer 2 folders below
      // (`o_layer2_*` sliders default to 0 so behavior matches the
      // old `phantomOpacity: 0` default exactly). The new controls
      // give finer-grained control over which side of the morph
      // fades and to what extent.
      showPhantomOutline: { value: false, label: "Show outlines" },
      disableMorph: { value: false, label: "Disable morph" },
      // B.PT171 — when enabled, the landing card stays mounted
      // alongside the modal AND keeps its layoutIds. Motion's natural
      // behavior with two simultaneous same-layoutId elements: it
      // picks one as "lead" (the latest mounted = modal phantom) and
      // applies inverse transforms to the "follow" (landing) so it
      // visually renders at the lead's rect. Both crossfade at the
      // shared destination position. With Layer 1 opacity = 1 + Layer
      // 2 phantom opacity = 0, the user sees full landing content at
      // the phantom rect (e.g. chips at 690×282 size). The morph IS
      // active in this mode (FLIP runs); the only non-production
      // change is that the landing doesn't unmount after AnimatePresence
      // exit so you can inspect it at the destination indefinitely.
      keepLandingMounted: { value: false, label: "Keep landing mounted" },
      // B.PT166 — z-index relative to the modal stacking context.
      // Modal scrim is z-40, modal dialog is z-50. Three presets:
      //   - above (default): z-[200] — panel always on top
      //   - between: z-[45] — sits between scrim + modal so the
      //     panel reads on top of the dimmed background but the
      //     modal content covers it (useful for inspecting modal
      //     drop shadow / edge effects without the panel obscuring)
      //   - below scrim: z-[30] — panel goes BEHIND the scrim,
      //     gets dimmed alongside the page; useful to see how the
      //     modal looks "alone" without panel distraction
      panelZ: {
        value: "above",
        options: ["above", "between", "below scrim"] as const,
        label: "Panel z-index",
      },
      openSpring: folder({
        openMass: { value: SPEC_OPEN.mass, min: 0.1, max: 10, step: 0.1 },
        openStiffness: { value: SPEC_OPEN.stiffness, min: 1, max: 1000, step: 1 },
        openDamping: { value: SPEC_OPEN.damping, min: 0, max: 100, step: 0.1 },
        openVelocity: { value: SPEC_OPEN.velocity, min: -50, max: 50, step: 0.5 },
      }),
      confirmSpring: folder({
        confirmMass: { value: SPEC_CONFIRM.mass, min: 0.1, max: 10, step: 0.1 },
        confirmStiffness: { value: SPEC_CONFIRM.stiffness, min: 1, max: 1000, step: 1 },
        confirmDamping: { value: SPEC_CONFIRM.damping, min: 0, max: 100, step: 0.1 },
        confirmVelocity: { value: SPEC_CONFIRM.velocity, min: -50, max: 50, step: 0.5 },
      }),
      closeSpring: folder({
        closeMass: { value: SPEC_CLOSE.mass, min: 0.1, max: 10, step: 0.1 },
        closeStiffness: { value: SPEC_CLOSE.stiffness, min: 1, max: 1000, step: 1 },
        closeDamping: { value: SPEC_CLOSE.damping, min: 0, max: 100, step: 0.1 },
        closeVelocity: { value: SPEC_CLOSE.velocity, min: -50, max: 50, step: 0.5 },
      }),
      // B.PT167 — z-index controls for SCENE elements. Two folders,
      // one per layer. Each control is a slider; value 0 means
      // "no override" (CSS default, no inline z-index). Slide
      // positive to bring forward, negative to push back. Range
      // -100..100 covers all useful adjustments since the scene
      // doesn't normally use explicit z-indexes — just source
      // order for stacking.
      "Layer 1 (landing)": folder(
        {
          // z-index overrides (B.PT167)
          z_layer1: { value: 0, min: -100, max: 100, step: 1, label: "Landing layer z" },
          z_layer1_identity: { value: 0, min: -100, max: 100, step: 1, label: "Identity header z" },
          z_layer1_slotList: { value: 0, min: -100, max: 100, step: 1, label: "Slot-list card z" },
          z_layer1_slot0: { value: 0, min: -100, max: 100, step: 1, label: "Slot 0 z" },
          z_layer1_slot1: { value: 0, min: -100, max: 100, step: 1, label: "Slot 1 z" },
          z_layer1_slot2: { value: 0, min: -100, max: 100, step: 1, label: "Slot 2 z" },
          z_layer1_slot3: { value: 0, min: -100, max: 100, step: 1, label: "Slot 3 z" },
          // opacity overrides (B.PT168) — Layer 1 has actual content
          // (avatar, h1, slot-list card with 4 chips), so default 1
          // matches production. Slide down to fade the landing during
          // the morph.
          o_layer1: { value: 1, min: 0, max: 1, step: 0.05, label: "Landing layer opacity" },
          o_layer1_identity: { value: 1, min: 0, max: 1, step: 0.05, label: "Identity opacity" },
          o_layer1_slotList: { value: 1, min: 0, max: 1, step: 0.05, label: "Slot-list opacity" },
          o_layer1_slot0: { value: 1, min: 0, max: 1, step: 0.05, label: "Slot 0 opacity" },
          o_layer1_slot1: { value: 1, min: 0, max: 1, step: 0.05, label: "Slot 1 opacity" },
          o_layer1_slot2: { value: 1, min: 0, max: 1, step: 0.05, label: "Slot 2 opacity" },
          o_layer1_slot3: { value: 1, min: 0, max: 1, step: 0.05, label: "Slot 3 opacity" },
        },
        { collapsed: true },
      ),
      "Layer 2 (modal phantoms)": folder(
        {
          // z-index overrides (B.PT167)
          z_layer2: { value: 0, min: -100, max: 100, step: 1, label: "Modal layer z" },
          z_layer2_identity: { value: 0, min: -100, max: 100, step: 1, label: "Phantom identity z" },
          z_layer2_slotList: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot-list z" },
          z_layer2_slot0: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 0 z" },
          z_layer2_slot1: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 1 z" },
          z_layer2_slot2: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 2 z" },
          z_layer2_slot3: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 3 z" },
          // opacity overrides (B.PT168) — Layer 2's "layer" is the
          // modal article (has real content: drawer body etc.) so
          // its layer-level opacity defaults to 1. The PHANTOM
          // children (identity/slotList/slot0..3) default to 0 since
          // they're empty rects — production behavior. User dials
          // up to inspect destinations, but each phantom's content
          // is empty rect + outline (toggle outline above).
          o_layer2: { value: 1, min: 0, max: 1, step: 0.05, label: "Modal article opacity" },
          o_layer2_identity: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom identity opacity" },
          o_layer2_slotList: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom slot-list opacity" },
          o_layer2_slot0: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom slot 0 opacity" },
          o_layer2_slot1: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom slot 1 opacity" },
          o_layer2_slot2: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom slot 2 opacity" },
          o_layer2_slot3: { value: 0, min: 0, max: 1, step: 0.05, label: "Phantom slot 3 opacity" },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

  // Map flat Leva results to the typed structure consumers expect.
  // Memoized so consumers don't re-render on unrelated parent renders.
  const value = useMemo<ModalDebugValues | null>(() => {
    if (!enabled) return null;
    return {
      // B.PT168 — `phantomOpacity` retired. Surfaced as
      // `oLayer2.identity/slotList/slot0..3` (each defaults to 0).
      // Kept the field on the type for back-compat with any external
      // consumer that still reads it; mirrors `oLayer2.identity` so
      // the simplest "make phantoms visible" toggle still works.
      phantomOpacity: ctrls.o_layer2_identity,
      showPhantomOutline: ctrls.showPhantomOutline,
      disableMorph: ctrls.disableMorph,
      keepLandingMounted: ctrls.keepLandingMounted,
      openSpring: {
        mass: ctrls.openMass,
        stiffness: ctrls.openStiffness,
        damping: ctrls.openDamping,
        velocity: ctrls.openVelocity,
      },
      confirmSpring: {
        mass: ctrls.confirmMass,
        stiffness: ctrls.confirmStiffness,
        damping: ctrls.confirmDamping,
        velocity: ctrls.confirmVelocity,
      },
      closeSpring: {
        mass: ctrls.closeMass,
        stiffness: ctrls.closeStiffness,
        damping: ctrls.closeDamping,
        velocity: ctrls.closeVelocity,
      },
      zLayer1: {
        layer: ctrls.z_layer1,
        identity: ctrls.z_layer1_identity,
        slotList: ctrls.z_layer1_slotList,
        slot0: ctrls.z_layer1_slot0,
        slot1: ctrls.z_layer1_slot1,
        slot2: ctrls.z_layer1_slot2,
        slot3: ctrls.z_layer1_slot3,
      },
      zLayer2: {
        layer: ctrls.z_layer2,
        identity: ctrls.z_layer2_identity,
        slotList: ctrls.z_layer2_slotList,
        slot0: ctrls.z_layer2_slot0,
        slot1: ctrls.z_layer2_slot1,
        slot2: ctrls.z_layer2_slot2,
        slot3: ctrls.z_layer2_slot3,
      },
      oLayer1: {
        layer: ctrls.o_layer1,
        identity: ctrls.o_layer1_identity,
        slotList: ctrls.o_layer1_slotList,
        slot0: ctrls.o_layer1_slot0,
        slot1: ctrls.o_layer1_slot1,
        slot2: ctrls.o_layer1_slot2,
        slot3: ctrls.o_layer1_slot3,
      },
      oLayer2: {
        layer: ctrls.o_layer2,
        identity: ctrls.o_layer2_identity,
        slotList: ctrls.o_layer2_slotList,
        slot0: ctrls.o_layer2_slot0,
        slot1: ctrls.o_layer2_slot1,
        slot2: ctrls.o_layer2_slot2,
        slot3: ctrls.o_layer2_slot3,
      },
    };
  }, [
    enabled,
    ctrls.showPhantomOutline,
    ctrls.disableMorph,
    ctrls.keepLandingMounted,
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
    ctrls.z_layer1,
    ctrls.z_layer1_identity,
    ctrls.z_layer1_slotList,
    ctrls.z_layer1_slot0,
    ctrls.z_layer1_slot1,
    ctrls.z_layer1_slot2,
    ctrls.z_layer1_slot3,
    ctrls.z_layer2,
    ctrls.z_layer2_identity,
    ctrls.z_layer2_slotList,
    ctrls.z_layer2_slot0,
    ctrls.z_layer2_slot1,
    ctrls.z_layer2_slot2,
    ctrls.z_layer2_slot3,
    ctrls.o_layer1,
    ctrls.o_layer1_identity,
    ctrls.o_layer1_slotList,
    ctrls.o_layer1_slot0,
    ctrls.o_layer1_slot1,
    ctrls.o_layer1_slot2,
    ctrls.o_layer1_slot3,
    ctrls.o_layer2,
    ctrls.o_layer2_identity,
    ctrls.o_layer2_slotList,
    ctrls.o_layer2_slot0,
    ctrls.o_layer2_slot1,
    ctrls.o_layer2_slot2,
    ctrls.o_layer2_slot3,
  ]);

  // B.PT166 — map z-preset to numeric value. Modal scrim z-40,
  // modal dialog z-50; panel choices straddle those layers.
  const panelZIndex =
    ctrls.panelZ === "above"
      ? 200
      : ctrls.panelZ === "between"
        ? 45
        : 30; // below scrim

  return (
    <ModalDebugContext.Provider
      value={{ values: value, panelShardRef: enabled ? panelShardRef : null }}
    >
      {enabled ? (
        // Wrapper div carries the shard ref AND the configurable
        // z-index. Leva renders inline (default isRoot=false) so the
        // wrapper is the actual panel container. `position: relative`
        // is required for `zIndex` to take effect.
        <div
          ref={panelShardRef}
          data-oh-debug-panel=""
          style={{ position: "relative", zIndex: panelZIndex }}
        >
          <Leva collapsed={false} oneLineLabels />
        </div>
      ) : null}
      {children}
    </ModalDebugContext.Provider>
  );
}
