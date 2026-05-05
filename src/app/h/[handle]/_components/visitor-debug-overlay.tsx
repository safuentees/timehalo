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

type SpringValues = {
  mass: number;
  stiffness: number;
  damping: number;
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
  showPhantomOutline: boolean;
  keepLandingMounted: boolean;
  openSpring: SpringValues;
  closeSpring: SpringValues;
  confirmSpring: SpringValues;
  zLayer1: ZBlock;
  zLayer2: ZBlock;
  oLayer1: OBlock;
  oLayer2: OBlock;
};

export function zStyle(v: number | undefined): number | undefined {
  if (v === undefined || v === 0) return undefined;
  return v;
}

export function oStyle(v: number | undefined, fallback: number): number {
  return v ?? fallback;
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
  slotList: 0,
  slot0: 0,
  slot1: 0,
  slot2: 0,
  slot3: 0,
};

export function VisitorDebugOverlay({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" && params?.get("debug") === "1";
  const panelShardRef = useRef<HTMLDivElement | null>(null);

  const ctrls = useControls(
    {
      mode: {
        value: "production",
        options: ["production", "inspect", "outline"] as const,
        label: "mode",
        hint:
          "production = real animation; inspect = frozen post-morph view (chip content rendered at destination rects, landing kept mounted); outline = dashed outline around phantom rects so you can see where motion is targeting.",
      },
      phantomOpacity: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.05,
        label: "phantom opacity",
        hint:
          "How visible the destination chip content is in inspect mode. 0 hides; 1 fully opaque.",
        render: (get) => get("mode") === "inspect",
      },
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
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

  const value = useMemo<ModalDebugValues | null>(() => {
    if (!enabled) return null;

    const inspect = ctrls.mode === "inspect";
    const outline = ctrls.mode === "outline";
    const phantomVis = ctrls.phantomOpacity;
    const landingOnTop = ctrls.stackOrder === "landing on top";

    const zL1: ZBlock = landingOnTop
      ? { ...NO_Z, layer: 100 }
      : NO_Z;

    return {
      showPhantomOutline: outline,
      keepLandingMounted: inspect,
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
      zLayer1: zL1,
      zLayer2: NO_Z,
      oLayer1: LAYER1_PROD_O,
      oLayer2: inspect
        ? {
            layer: 1,
            identity: phantomVis,
            slotList: 0,
            slot0: phantomVis,
            slot1: phantomVis,
            slot2: phantomVis,
            slot3: phantomVis,
          }
        : LAYER2_PROD_O,
    };
  }, [
    enabled,
    ctrls.mode,
    ctrls.phantomOpacity,
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
  ]);

  return (
    <ModalDebugContext.Provider
      value={{ values: value, panelShardRef: enabled ? panelShardRef : null }}
    >
      {enabled ? (
        <div
          ref={panelShardRef}
          data-oh-debug-panel=""
          style={{ position: "relative", zIndex: 200 }}
        >
          <Leva collapsed={false} oneLineLabels />
        </div>
      ) : null}
      {children}
    </ModalDebugContext.Provider>
  );
}
