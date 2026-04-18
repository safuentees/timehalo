export type PanelKey = "A" | "B" | "C" | "D";

export type Tweaks = {
  rippleMix: number;
  baseMix: number;
  rippleSpeed: number;
  rippleFreq: number;
  swirl: number;
  orbitCount: number;
  orbitSpeed: number;
  orbitRadius: number;
  contrast: number;
  mouseWarp: number;
  timeScale: number;
};

export type TweakKey = keyof Tweaks;

export const DEFAULT_STATE: Tweaks = {
  rippleMix: 0.55,
  baseMix: 0.4,
  rippleSpeed: 0.3,
  rippleFreq: 8,
  swirl: 0.35,
  orbitCount: 6,
  orbitSpeed: 0.2,
  orbitRadius: 0.25,
  contrast: 0.18,
  mouseWarp: 0.18,
  timeScale: 1.0,
};

export type SliderDef = {
  k: TweakKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const SLIDERS: readonly SliderDef[] = [
  { k: "rippleMix", label: "ripple mix", min: 0, max: 1, step: 0.01 },
  { k: "baseMix", label: "base noise", min: 0, max: 1, step: 0.01 },
  { k: "rippleSpeed", label: "pulse rate", min: 0, max: 2, step: 0.01 },
  { k: "rippleFreq", label: "ring density", min: 1, max: 24, step: 1 },
  { k: "swirl", label: "swirl", min: 0, max: 1, step: 0.01 },
  { k: "orbitCount", label: "layers (1-10)", min: 1, max: 10, step: 1 },
  { k: "orbitSpeed", label: "drift", min: -0.6, max: 0.6, step: 0.01 },
  { k: "orbitRadius", label: "ellipse ↔ circle", min: 0, max: 0.6, step: 0.01 },
  { k: "contrast", label: "contrast cut", min: 0, max: 0.5, step: 0.01 },
  { k: "mouseWarp", label: "cursor warp", min: 0, max: 0.6, step: 0.01 },
  { k: "timeScale", label: "time scale", min: 0, max: 2, step: 0.01 },
] as const;

export type Preset = {
  id: string;
  label: string;
  apply: (t: Tweaks) => Tweaks;
};

export const PRESETS: readonly Preset[] = [
  { id: "default", label: "hero default", apply: () => ({ ...DEFAULT_STATE }) },
  { id: "slowmo", label: "slow-mo 0.2x", apply: (t) => ({ ...t, timeScale: 0.2 }) },
  { id: "freeze", label: "freeze", apply: (t) => ({ ...t, timeScale: 0 }) },
  { id: "max", label: "max layers", apply: (t) => ({ ...t, orbitCount: 10 }) },
] as const;

export function mapLayers(orbitCount: number): number {
  const c = Math.max(1, Math.min(10, Math.round(orbitCount || 1)));
  return Math.round(16 + ((c - 1) * (128 - 16)) / 9);
}

export function formatVal(v: number, step: number): string {
  if (step >= 1) return String(v | 0);
  if (step >= 0.1) return v.toFixed(1);
  return v.toFixed(2);
}

export const PANEL_META: Record<PanelKey, { title: string; subtitle: string }> = {
  A: {
    title: "Wave-interference field",
    subtitle: "Shadertoy 4sdBW7 — 128 sin-of-sin layers",
  },
  B: {
    title: "Domain-warped fBm",
    subtitle: "Simplex noise, 4 octaves, 2-channel warp",
  },
  C: {
    title: "Composite field",
    subtitle: "A + B with vignette, drift, cursor warp",
  },
  D: {
    title: "Dot-matrix halftone",
    subtitle: "C sampled to a 14 px grid — what the hero renders",
  },
};

export const PANEL_KEYS: readonly PanelKey[] = ["A", "B", "C", "D"] as const;

export const DOT_STEP = 14;
export const DPR_CAP = 2;
