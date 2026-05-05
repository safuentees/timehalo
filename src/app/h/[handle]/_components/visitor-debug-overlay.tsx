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
};

export function zStyle(v: number | undefined): number | undefined {
  if (v === undefined || v === 0) return undefined;
  return v;
}

type ModalDebugContextValue = {
  values: ModalDebugValues | null;
  panelShardRef: RefObject<HTMLDivElement | null> | null;
};

const ModalDebugContext = createContext<ModalDebugContextValue>({
  values: null,
  panelShardRef: null,
});

export function useModalDebug() {
  return useContext(ModalDebugContext);
}

export function VisitorDebugOverlay({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";
  const panelShardRef = useRef<HTMLDivElement | null>(null);

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
      "Layer 1 (landing)": folder(
        {
          z_layer1: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Landing layer z",
          },
          z_layer1_identity: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Identity header z",
          },
          z_layer1_slotList: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Slot-list card z",
          },
          z_layer1_slot0: { value: 0, min: -100, max: 100, step: 1, label: "Slot 0 z" },
          z_layer1_slot1: { value: 0, min: -100, max: 100, step: 1, label: "Slot 1 z" },
          z_layer1_slot2: { value: 0, min: -100, max: 100, step: 1, label: "Slot 2 z" },
          z_layer1_slot3: { value: 0, min: -100, max: 100, step: 1, label: "Slot 3 z" },
        },
        { collapsed: true },
      ),
      "Layer 2 (modal phantoms)": folder(
        {
          z_layer2: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Modal layer z",
          },
          z_layer2_identity: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Phantom identity z",
          },
          z_layer2_slotList: {
            value: 0,
            min: -100,
            max: 100,
            step: 1,
            label: "Phantom slot-list z",
          },
          z_layer2_slot0: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 0 z" },
          z_layer2_slot1: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 1 z" },
          z_layer2_slot2: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 2 z" },
          z_layer2_slot3: { value: 0, min: -100, max: 100, step: 1, label: "Phantom slot 3 z" },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

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
  ]);

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
