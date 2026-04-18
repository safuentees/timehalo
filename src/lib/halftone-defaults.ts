export type HalftoneTweaks = {
  rippleMix: number;
  baseMix: number;
  rippleSpeed: number;
  rippleFreq: number;
  swirl: number;
  orbitCount: number;
  orbitSpeed: number;
  orbitRadius: number;
  contrast: number;
};

export const HALFTONE_DEFAULTS: HalftoneTweaks = {
  rippleMix: 0.63,
  baseMix: 0.44,
  rippleSpeed: 0.25,
  rippleFreq: 5.5,
  swirl: 0.8,
  orbitCount: 1,
  orbitSpeed: 0,
  orbitRadius: 0.4,
  contrast: 0.05,
};
