"use client";

// Dot-matrix halftone hero — single-canvas WebGL pipeline.
//
// Pass 1: FRAG_C renders the halftone field into an offscreen FBO at grid
//         resolution (88x34 @ 1205x458, step=14).
// Pass 2: FRAG_DOTS samples the FBO and rasterizes dots directly to the
//         visible canvas, no Canvas2D arc() loop, no CPU-side per-dot
//         work, no OOPC IPC overhead in Firefox.

import { useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { FRAG_C, DOT_STEP } from "@/lib/halftone/shaders";
import { useHalftoneCanvas } from "@/lib/halftone/use-halftone-canvas";
import { useHalftoneTweaks } from "./tweaks-context";
import { useBrutalistPrefs } from "./prefs-context";
import type { HalftoneTweaks } from "@/lib/halftone-defaults";

const INT_UNIFORMS = ["uLayers", "uShowVignette"] as const;
void INT_UNIFORMS;
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(FROZEN_T);
  const lastNowRef = useRef<number | null>(null);

  const reduced = useReducedMotion();

  useHalftoneCanvas(canvasRef, {
    frag: FRAG_C,
    gridRes: () => {
      const cont = containerRef.current;
      if (!cont) return { cols: 1, rows: 1 };
      const r = cont.getBoundingClientRect();
      const cols = Math.max(1, Math.ceil(r.width / DOT_STEP) + 1);
      const rows = Math.max(1, Math.ceil(r.height / DOT_STEP) + 1);
      return { cols, rows };
    },
    step: DOT_STEP,
    getContrast: () => tweaks.contrast,
    getDotColor: color ? () => color : undefined,
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
      const tk: HalftoneTweaks = tweaks;
      const layers = mapLayers(tk.orbitCount);
      const round = Math.min(1, Math.max(0, tk.orbitRadius / 0.6));

      return {
        uTime: timeRef.current,
        uAspect: aspect,
        uMouse: [0.5, 0.5] as const,
        uMouseWarp: 0,
        uRippleMix: tk.rippleMix,
        uBaseMix: tk.baseMix,
        uRippleSpeed: tk.rippleSpeed,
        uRippleFreq: tk.rippleFreq,
        uSwirl: tk.swirl,
        uLayers: layers,
        uDrift: tk.orbitSpeed,
        uRound: round,
        uShowVignette: 0,
      };
    },
  });

  return (
    <div
      ref={containerRef}
      className="bru-halftone-canvas"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
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
