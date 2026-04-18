"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { PANEL_FRAG } from "../_lib/shaders";
import { DOT_STEP, PANEL_META } from "../_lib/constants";
import { buildUniforms, INT_UNIFORMS } from "../_lib/build-uniforms";
import { useHalftoneLab } from "../_lib/use-halftone-state";
import { useShaderCanvas } from "@/lib/halftone/use-shader-canvas";
import { useDotRaster } from "@/lib/halftone/use-dot-raster";
import {
  useFpsEntry,
  publishFps,
  publishHistogram,
} from "../_lib/use-halftone-telemetry";
import { OverlaySVG } from "./overlay-svg";

type Props = {
  footContent?: ReactNode;
};

export function DotPanel({ footContent }: Props) {
  const panelKey = "D" as const;
  const { stateRef, mouseRef, dispatch, state } = useHalftoneLab();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pixelsRef = useRef<Uint8Array | null>(null);
  const gridRef = useRef({ cols: 1, rows: 1 });

  const timeRef = useRef(0);
  const lastNowRef = useRef<number | null>(null);
  const meta = PANEL_META[panelKey];
  const fpsEntry = useFpsEntry(panelKey);

  const gridRes = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return { cols: 1, rows: 1 };
    const r = body.getBoundingClientRect();
    const cols = Math.max(1, Math.ceil(r.width / DOT_STEP) + 1);
    const rows = Math.max(1, Math.ceil(r.height / DOT_STEP) + 1);
    gridRef.current = { cols, rows };
    return { cols, rows };
  }, []);

  const getUniforms = useCallback(() => {
    const body = bodyRef.current;
    const now = performance.now();
    const prev = lastNowRef.current ?? now;
    lastNowRef.current = now;
    const dt = Math.min((now - prev) / 1000, 1 / 30);
    timeRef.current += dt * stateRef.current.tweaks.timeScale;
    const aspect =
      body && body.clientHeight > 0 ? body.clientWidth / body.clientHeight : 1;
    return buildUniforms(
      panelKey,
      stateRef.current,
      mouseRef.current,
      timeRef.current,
      aspect,
    );
  }, [mouseRef, stateRef]);

  const onPixels = useCallback((pixels: Uint8Array) => {
    pixelsRef.current = pixels;
  }, []);

  useShaderCanvas(glCanvasRef, {
    frag: PANEL_FRAG[panelKey],
    getUniforms,
    intUniforms: INT_UNIFORMS,
    gridRes,
    onFrame: (fps, gpuMs) => publishFps(panelKey, fps, gpuMs),
    onPixels,
  });

  useDotRaster(bodyRef, dotCanvasRef, {
    getPixels: () => pixelsRef.current,
    getGrid: () => gridRef.current,
    getContrast: () => stateRef.current.tweaks.contrast,
    onHistogram: (hist) => publishHistogram(hist),
  });

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const body = bodyRef.current;
      if (!body) return;
      const r = body.getBoundingClientRect();
      const tx = (e.clientX - r.left) / r.width;
      const ty = (e.clientY - r.top) / r.height;
      const m = mouseRef.current;
      m.tx = Math.min(1, Math.max(0, tx));
      m.ty = Math.min(1, Math.max(0, ty));
      m.hovering = true;
      m.activePanel = panelKey;
      if (stateRef.current.syncCode && stateRef.current.activeCode !== panelKey) {
        dispatch({ type: "SET_ACTIVE_CODE", v: panelKey });
      }
    },
    [dispatch, mouseRef, stateRef],
  );

  const onPointerLeave = useCallback(() => {
    const m = mouseRef.current;
    m.hovering = false;
    if (m.activePanel === panelKey) m.activePanel = null;
  }, [mouseRef]);

  return (
    <figure className="group relative flex h-full min-h-0 flex-col border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--halftone-accent)]">
              panel D
            </span>
            <h3 className="truncate text-sm font-semibold text-foreground">
              {meta.title}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {meta.subtitle}
          </p>
        </div>
        <div className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
          {fpsEntry.fps > 0 ? fpsEntry.fps.toFixed(0) : "—"} fps
          <span className="mx-1 text-muted-foreground/40">·</span>
          {fpsEntry.gpuMs > 0 ? fpsEntry.gpuMs.toFixed(1) : "—"} ms
        </div>
      </header>

      <div
        ref={bodyRef}
        className="relative flex-1 min-h-[220px] overflow-hidden bg-background text-foreground"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <canvas
          ref={glCanvasRef}
          className="hidden"
          aria-hidden="true"
        />
        <canvas
          ref={dotCanvasRef}
          className="absolute inset-0 block h-full w-full"
        />
        {state.overlays.enabled ? (
          <OverlaySVG showDrift panelKey={panelKey} />
        ) : null}
      </div>

      {footContent ? (
        <footer className="flex items-center gap-3 border-t border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {footContent}
        </footer>
      ) : null}
    </figure>
  );
}
