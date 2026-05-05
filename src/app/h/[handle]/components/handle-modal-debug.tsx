"use client";

import { useSearchParams } from "next/navigation";
import { folder, Leva, useControls } from "leva";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";

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
  phantomOpacity: number;
  showPhantomOutline: boolean;
  disableMorph: boolean;
  openSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  closeSpring: { mass: number; stiffness: number; damping: number; velocity: number };
  confirmSpring: { mass: number; stiffness: number; damping: number; velocity: number };
};

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

export function ModalDebugPanel() {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";
  if (!enabled) return null;
  return <Leva collapsed={false} oneLineLabels />;
}
