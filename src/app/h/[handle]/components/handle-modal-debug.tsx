"use client";

import { useSearchParams } from "next/navigation";
import { folder, Leva, useControls } from "leva";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";

// B.PT163 — Animation debug panel for `<HandleModal>` (visitor-page
// redesign). Gated behind `?debug=1` AND `NODE_ENV === "development"`
// so the Leva runtime + UI never ship to production users.
//
// What this gives you (when active):
//   - Live spring physics — slide stiffness / damping / mass / velocity
//     and watch the morph re-tune without a reload.
//   - "Phantom opacity" slider — bump 0 → 1 to make the otherwise-
//     invisible morph destinations stay visible at the end state.
//     Useful for inspecting whether the chips actually land where the
//     spec says they should.
//   - "Show phantom outlines" toggle — 1px ink ring on each phantom
//     so you can see where motion is targeting them, even at opacity 0.
//   - "Disable morph" toggle — drops the layoutId-shared morph and
//     falls back to a plain instant render. Useful for an A/B compare.
//
// All defaults match the Figma spec (`anim-h-handle-redesign.json`)
// so opening the panel without touching anything reproduces production
// behavior exactly. Each control's "default" value is shown alongside.

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
   *  behavior. 1 = phantoms stay visible after the morph completes. */
  phantomOpacity: number;
  /** When true, render a 1px ink ring around each phantom so you can
   *  see where motion is targeting them. */
  showPhantomOutline: boolean;
  /** When true, all the layoutId / motion.div magic is skipped and
   *  the modal just renders without a morph. Useful for A/B compare. */
  disableMorph: boolean;
  /** Spring physics — defaults read from the anim spec. */
  openSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  closeSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  confirmSpring: { mass: number; stiffness: number; damping: number; velocity: number };
};

/**
 * Returns the active debug values, OR `null` when the panel isn't
 * enabled (production, no query param, etc.). Consumers fall back to
 * the spec constants when this is null.
 *
 * Note: the hook ALWAYS calls `useControls` (React hook rules) — only
 * the return value is gated. Leva's runtime cost when not visible is
 * one hook subscription + state slice; the panel UI is rendered by
 * `<DebugPanel>` separately, which IS conditionally mounted.
 */
export function useModalDebugValues(): ModalDebugValues | null {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";

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
}

/**
 * Mounts the Leva panel UI itself. Render this once per page tree when
 * the debug flag is set. Calling site does:
 *
 *   {process.env.NODE_ENV === "development" ? <ModalDebugPanel /> : null}
 *
 * Even when mounted, Leva auto-hides if no `useControls` registered yet
 * — so the panel only shows up after `useModalDebugValues()` runs in a
 * descendant.
 */
export function ModalDebugPanel() {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";
  if (!enabled) return null;
  return <Leva collapsed={false} oneLineLabels />;
}
