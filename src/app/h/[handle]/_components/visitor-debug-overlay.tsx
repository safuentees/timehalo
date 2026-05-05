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
  /** Spring physics — defaults read from the anim spec. */
  openSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  closeSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  confirmSpring: { mass: number; stiffness: number; damping: number; velocity: number };
};

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
      phantomOpacity: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.05,
        label: "Phantom opacity",
      },
      showPhantomOutline: { value: false, label: "Show outlines" },
      disableMorph: { value: false, label: "Disable morph" },
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
    },
    { collapsed: false },
  );

  // Map flat Leva results to the typed structure consumers expect.
  // Memoized so consumers don't re-render on unrelated parent renders.
  const value = useMemo<ModalDebugValues | null>(() => {
    if (!enabled) return null;
    return {
      phantomOpacity: ctrls.phantomOpacity,
      showPhantomOutline: ctrls.showPhantomOutline,
      disableMorph: ctrls.disableMorph,
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
    };
  }, [
    enabled,
    ctrls.phantomOpacity,
    ctrls.showPhantomOutline,
    ctrls.disableMorph,
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
  ]);

  return (
    <ModalDebugContext.Provider
      value={{ values: value, panelShardRef: enabled ? panelShardRef : null }}
    >
      {enabled ? (
        // Wrapper div carries the shard ref. Leva itself renders to
        // `document.body` via portal, so the wrapper is empty in the
        // visible tree — but FocusOn's shards check ALSO includes
        // children of the shard root via DOM tree walks; the empty
        // wrapper is enough as a hook into the portal target. NOTE
        // if Leva ever stops portalling (newer versions or theme
        // configs), the panel will render inside this wrapper
        // directly, which is also fine for shards.
        <div ref={panelShardRef} data-oh-debug-panel="">
          <Leva collapsed={false} oneLineLabels />
        </div>
      ) : null}
      {children}
    </ModalDebugContext.Provider>
  );
}
