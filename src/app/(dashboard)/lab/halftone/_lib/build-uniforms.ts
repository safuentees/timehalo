import { mapLayers, type PanelKey } from "./constants";
import type { HalftoneState, Mouse } from "./use-halftone-state";
import type { UniformValue } from "@/lib/halftone/use-shader-canvas";

export const INT_UNIFORMS = [
  "uLayers",
  "uShowCurrentOnly",
  "uShowWarp",
  "uShowVignette",
] as const;

export function buildUniforms(
  panel: PanelKey,
  state: HalftoneState,
  mouse: Mouse,
  time: number,
  aspect: number,
): Record<string, UniformValue> {
  const { tweaks, perPanel } = state;

  const layersBase = mapLayers(tweaks.orbitCount);
  const layers = perPanel.A.layerOverride ?? layersBase;

  const round = Math.min(1, Math.max(0, tweaks.orbitRadius / 0.6));

  const u: Record<string, UniformValue> = {
    uTime: time,
    uAspect: aspect,
    uMouse: [mouse.x, 1 - mouse.y] as const,
    uMouseWarp: tweaks.mouseWarp,
    uRippleMix: tweaks.rippleMix,
    uBaseMix: tweaks.baseMix,
    uRippleSpeed: tweaks.rippleSpeed,
    uRippleFreq: tweaks.rippleFreq,
    uSwirl: tweaks.swirl,
    uLayers: layers,
    uDrift: tweaks.orbitSpeed,
    uRound: round,
    uShowCurrentOnly: panel === "A" && perPanel.A.showCurrentOnly ? 1 : 0,
    uShowWarp: panel === "B" && perPanel.B.showWarp ? 1 : 0,
    uShowVignette:
      (panel === "C" && perPanel.C.showVignette) ||
      (panel === "D" && perPanel.D.showVignette)
        ? 1
        : 0,
  };

  return u;
}
