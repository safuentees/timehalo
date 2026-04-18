"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  DEFAULT_STATE,
  PANEL_KEYS,
  type PanelKey,
  type Tweaks,
  type TweakKey,
} from "./constants";

export type Overlays = {
  enabled: boolean;
};

export type PerPanel = {
  A: { layerOverride: number | null; showCurrentOnly: boolean };
  B: { showWarp: boolean };
  C: { showVignette: boolean };
  D: { showVignette: boolean };
};

export type HalftoneState = {
  tweaks: Tweaks;
  overlays: Overlays;
  perPanel: PerPanel;
  activeCode: PanelKey;
  syncCode: boolean;
};

const INITIAL: HalftoneState = {
  tweaks: { ...DEFAULT_STATE },
  overlays: { enabled: false },
  perPanel: {
    A: { layerOverride: null, showCurrentOnly: false },
    B: { showWarp: false },
    C: { showVignette: false },
    D: { showVignette: false },
  },
  activeCode: "C",
  syncCode: true,
};

type PanelOptPayload =
  | { panel: "A"; key: "showCurrentOnly"; value: boolean }
  | { panel: "B"; key: "showWarp"; value: boolean }
  | { panel: "C"; key: "showVignette"; value: boolean }
  | { panel: "D"; key: "showVignette"; value: boolean };

export type Action =
  | { type: "SET_TWEAK"; k: TweakKey; v: number }
  | { type: "SET_TWEAKS"; v: Partial<Tweaks> }
  | { type: "SET_OVERLAY"; enabled: boolean }
  | { type: "SET_PANEL_OPT"; payload: PanelOptPayload }
  | { type: "SET_ACTIVE_CODE"; v: PanelKey }
  | { type: "TOGGLE_SYNC" }
  | { type: "SET_LAYER_OVERRIDE"; v: number | null }
  | { type: "RESET" };

function reducer(state: HalftoneState, action: Action): HalftoneState {
  switch (action.type) {
    case "SET_TWEAK":
      return { ...state, tweaks: { ...state.tweaks, [action.k]: action.v } };
    case "SET_TWEAKS":
      return { ...state, tweaks: { ...state.tweaks, ...action.v } };
    case "SET_OVERLAY":
      return { ...state, overlays: { enabled: action.enabled } };
    case "SET_PANEL_OPT": {
      const { panel, key, value } = action.payload;
      return {
        ...state,
        perPanel: {
          ...state.perPanel,
          [panel]: { ...state.perPanel[panel], [key]: value },
        },
      };
    }
    case "SET_ACTIVE_CODE":
      return { ...state, activeCode: action.v };
    case "TOGGLE_SYNC":
      return { ...state, syncCode: !state.syncCode };
    case "SET_LAYER_OVERRIDE":
      return {
        ...state,
        perPanel: {
          ...state.perPanel,
          A: { ...state.perPanel.A, layerOverride: action.v },
        },
      };
    case "RESET":
      return INITIAL;
  }
}

export type Mouse = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  hovering: boolean;
  activePanel: PanelKey | null;
};

export type HalftoneContextValue = {
  state: HalftoneState;
  stateRef: RefObject<HalftoneState>;
  dispatch: React.Dispatch<Action>;
  mouseRef: RefObject<Mouse>;
};

const Ctx = createContext<HalftoneContextValue | null>(null);

export function HalftoneLabProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const stateRef = useRef<HalftoneState>(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const mouseRef = useRef<Mouse>({
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
    hovering: false,
    activePanel: null,
  });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const m = mouseRef.current;
      m.x += (m.tx - m.x) * 0.08;
      m.y += (m.ty - m.y) * 0.08;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const priorTimeScaleRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyReduced = () => {
      priorTimeScaleRef.current = stateRef.current.tweaks.timeScale;
      dispatch({ type: "SET_TWEAK", k: "timeScale", v: 0 });
    };
    const restore = () => {
      const prior = priorTimeScaleRef.current;
      priorTimeScaleRef.current = null;
      dispatch({
        type: "SET_TWEAK",
        k: "timeScale",
        v: prior ?? DEFAULT_STATE.timeScale,
      });
    };

    if (mq.matches) applyReduced();

    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) applyReduced();
      else if (priorTimeScaleRef.current !== null) restore();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const value = useMemo<HalftoneContextValue>(
    () => ({ state, stateRef, dispatch, mouseRef }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHalftoneLab(): HalftoneContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHalftoneLab must be used inside HalftoneLabProvider");
  return ctx;
}

export { PANEL_KEYS };
