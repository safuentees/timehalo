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
  showPhantomOutline: boolean;
  showPhantomLabels: boolean;
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

const DISABLED_DEBUG_CONTEXT: ModalDebugContextValue = {
  values: null,
  panelShardRef: null,
};

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

  const ctrls = useControls(
    {
      mode: {
        value: "inspect",
        options: ["production", "inspect", "outline"] as const,
        label: "mode",
        hint:
          "production = real animation; inspect = frozen post-morph view (chip content rendered at destination rects, landing kept mounted); outline = dashed outline around phantom rects so you can see where motion is targeting.",
      },
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
          visualDuration: {
            value: 0,
            min: 0,
            max: 15,
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

    const zL1: ZBlock = landingOnTop
      ? { ...NO_Z, layer: 100 }
      : NO_Z;

    const slots = ctrls.slotsOpacity;

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
