"use client";

// Dot-matrix halftone hero — WebGL pipeline shared with the halftone lab.
// The field (wave interference + domain-warped fBm + vignette + drift) is
// rendered by FRAG_C on a hidden GL canvas at grid resolution, then
// readPixels-sampled and drawn as halftone dots on a sibling 2D canvas.

import { useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { FRAG_C } from "@/lib/halftone/shaders";
import { useShaderCanvas } from "@/lib/halftone/use-shader-canvas";
import { useDotRaster } from "@/lib/halftone/use-dot-raster";
import { useHalftoneTweaks } from "./tweaks-context";
import { useBrutalistPrefs } from "./prefs-context";

const STEP = 14;
const INT_UNIFORMS = ["uLayers", "uShowVignette"] as const;
const FROZEN_T = 4.2;

function mapLayers(n: number): number {
  const c = Math.max(1, Math.min(10, Math.round(n || 1)));
  return Math.round(16 + ((c - 1) * (128 - 16)) / 9);
}

export type HalftoneHeroProps = {
  color?: string;
};

export default function HalftoneHero({ color }: HalftoneHeroProps) {
  const { tweaks } = useHalftoneTweaks();
  const { motion } = useBrutalistPrefs();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef<Uint8Array | null>(null);
  const gridRef = useRef({ cols: 1, rows: 1 });
  const timeRef = useRef(FROZEN_T);
  const lastNowRef = useRef<number | null>(null);

  const reduced = useReducedMotion();

  useShaderCanvas(glCanvasRef, {
    frag: FRAG_C,
    intUniforms: INT_UNIFORMS,
    gridRes: () => {
      const cont = containerRef.current;
      if (!cont) return { cols: 1, rows: 1 };
      const r = cont.getBoundingClientRect();
      const cols = Math.max(1, Math.ceil(r.width / STEP) + 1);
      const rows = Math.max(1, Math.ceil(r.height / STEP) + 1);
      gridRef.current = { cols, rows };
      return { cols, rows };
    },
    getUniforms: () => {
      const cont = containerRef.current;
      const now = performance.now();
      const prev = lastNowRef.current ?? now;
      lastNowRef.current = now;
      const dt = Math.min((now - prev) / 1000, 1 / 30);

      const running = motion && !reduced;
      if (running) timeRef.current += dt;

      const aspect =
        cont && cont.clientHeight > 0
          ? cont.clientWidth / cont.clientHeight
          : 1;
      const layers = mapLayers(tweaks.orbitCount);
      const round = Math.min(1, Math.max(0, tweaks.orbitRadius / 0.6));

      return {
        uTime: timeRef.current,
        uAspect: aspect,
        uMouse: [0.5, 0.5] as const,
        uMouseWarp: 0,
        uRippleMix: tweaks.rippleMix,
        uBaseMix: tweaks.baseMix,
        uRippleSpeed: tweaks.rippleSpeed,
        uRippleFreq: tweaks.rippleFreq,
        uSwirl: tweaks.swirl,
        uLayers: layers,
        uDrift: tweaks.orbitSpeed,
        uRound: round,
        uShowVignette: 0,
      };
    },
    onPixels: (pixels) => {
      pixelsRef.current = pixels;
    },
  });

  useDotRaster(containerRef, dotCanvasRef, {
    getPixels: () => pixelsRef.current,
    getGrid: () => gridRef.current,
    getContrast: () => tweaks.contrast,
    getDotColor: color ? () => color : undefined,
  });

  return (
    <div
      ref={containerRef}
      className="bru-halftone-canvas"
      aria-hidden="true"
    >
      <canvas ref={glCanvasRef} className="hidden" aria-hidden="true" />
      <canvas
        ref={dotCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          color: "inherit",
        }}
      />
    </div>
  );
}
