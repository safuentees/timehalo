"use client";

import { useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { HALFTONE_DEFAULTS, type HalftoneTweaks } from "@/lib/halftone-defaults";
import { FRAG_C } from "@/lib/halftone/shaders";
import { useShaderCanvas } from "@/lib/halftone/use-shader-canvas";
import { useDotRaster } from "@/lib/halftone/use-dot-raster";

const STEP = 14;
const INT_UNIFORMS = ["uLayers", "uShowVignette"] as const;
const FROZEN_T = 4.2;

function mapLayers(n: number): number {
  const c = Math.max(1, Math.min(10, Math.round(n || 1)));
  return Math.round(16 + ((c - 1) * (128 - 16)) / 9);
}

export type HalftoneHeroProps = {
  motion?: boolean;
  color?: string;
  tweaks?: Partial<HalftoneTweaks>;
};

export default function HalftoneHero({
  motion = true,
  color,
  tweaks,
}: HalftoneHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef<Uint8Array | null>(null);
  const gridRef = useRef({ cols: 1, rows: 1 });
  const timeRef = useRef(FROZEN_T);
  const lastNowRef = useRef<number | null>(null);

  const reduced = useReducedMotion();
  const tk: HalftoneTweaks = { ...HALFTONE_DEFAULTS, ...(tweaks ?? {}) };

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
    onPixels: (pixels) => {
      pixelsRef.current = pixels;
    },
  });

  useDotRaster(containerRef, dotCanvasRef, {
    getPixels: () => pixelsRef.current,
    getGrid: () => gridRef.current,
    getContrast: () => tk.contrast,
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
