"use client";

import createREGL from "regl";
import type REGL from "regl";
import { useEffect, type RefObject } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  SHARED_SNOISE,
  SHARED_VERT,
  FRAG_DOTS,
  DOT_STEP,
  DOT_MAX_RADIUS,
} from "./shaders";

export type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number];

export type UseHalftoneCanvasOpts = {
  /** Field fragment shader (e.g. FRAG_C). Grayscale output in R channel. */
  frag: string;
  /** Per-frame uniforms for the field shader. */
  getUniforms: () => Record<string, UniformValue>;
  /** Grid size (cols x rows) — drives the FBO size + dot count. */
  gridRes: () => { cols: number; rows: number };
  /** Dot spacing in CSS pixels. Defaults to 14. */
  step?: number;
  /** Contrast cutoff 0..1. Brightness below this = no dot. */
  getContrast: () => number;
  /**
   * Dot color as a CSS color string (e.g. "#eee7d5", "rgb(...)"). Optional —
   * if omitted the hook reads `color` from the canvas's computed style each
   * frame, same as the previous 2D-canvas path did.
   */
  getDotColor?: () => string | undefined;
  /** Pause both passes when this returns true. */
  paused?: () => boolean;
  /** FPS + GPU-ms telemetry callback, fired ~1 Hz. */
  onFrame?: (fps: number, gpuMs: number) => void;
  /**
   * 256-bucket R-channel histogram of the field texture. Called every
   * 4th frame like the previous implementation. Omit if you don't need it.
   */
  onHistogram?: (hist: Uint32Array) => void;
  /** Cap device pixel ratio for the visible canvas. Defaults to 2. */
  dprCap?: number;
};

type FieldUniformProps = Record<string, UniformValue>;
type DotUniformProps = {
  uField: REGL.Framebuffer2D;
  uCanvasSize: readonly [number, number];
  uGridSize: readonly [number, number];
  uStep: number;
  uContrast: number;
  uDotColor: readonly [number, number, number];
  uEdgeMargin: number;
};

type HalftoneState = {
  regl: REGL.Regl;
  field: REGL.DrawCommand<REGL.DefaultContext, FieldUniformProps>;
  dots: REGL.DrawCommand<REGL.DefaultContext, DotUniformProps>;
  fbo: REGL.Framebuffer2D;
  pixels: Uint8Array;
  lastGridCols: number;
  lastGridRows: number;
  lastCanvasW: number;
  lastCanvasH: number;
};

// Canvas DOM may be reused across React Strict Mode remount + Next router cache
// nav. Cache the regl instance + compiled passes per canvas so we don't
// re-initialize on a live context.
const cache: WeakMap<HTMLCanvasElement, Map<string, HalftoneState>> =
  new WeakMap();

// Module-level 1x1 canvas for CSS color parsing. Using the 2D canvas to parse
// covers ANY valid CSS color format (hex, rgb, rgba, hsl, lab, oklch, named
// colors, etc.). Modern browsers return computed styles in `lab()` or
// `oklch()` from oklch-based theme vars, which naive regex parsers miss.
const COLOR_PARSE_CANVAS =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
if (COLOR_PARSE_CANVAS) {
  COLOR_PARSE_CANVAS.width = 1;
  COLOR_PARSE_CANVAS.height = 1;
}
const COLOR_CACHE: Map<string, [number, number, number]> = new Map();

function parseCssColor(css: string): [number, number, number] {
  const cached = COLOR_CACHE.get(css);
  if (cached) return cached;
  if (!COLOR_PARSE_CANVAS) {
    const fallback: [number, number, number] = [0, 0, 0];
    return fallback;
  }
  const ctx = COLOR_PARSE_CANVAS.getContext("2d");
  if (!ctx) {
    const fallback: [number, number, number] = [0, 0, 0];
    return fallback;
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const rgb: [number, number, number] = [d[0] / 255, d[1] / 255, d[2] / 255];
  // Cap cache at reasonable size to avoid unbounded growth if caller passes
  // many unique colors.
  if (COLOR_CACHE.size < 32) COLOR_CACHE.set(css, rgb);
  return rgb;
}

function getOrCreateState(
  canvas: HTMLCanvasElement,
  frag: string,
): HalftoneState | null {
  let byFrag = cache.get(canvas);
  if (!byFrag) {
    byFrag = new Map();
    cache.set(canvas, byFrag);
  }
  const existing = byFrag.get(frag);
  if (existing) return existing;

  let regl: REGL.Regl;
  try {
    regl = createREGL({
      canvas,
      attributes: {
        antialias: false,
        premultipliedAlpha: false,
        alpha: true,
        // No external readbacks from the default framebuffer — readPixels
        // happens only against the FBO (via regl.read(framebuffer)). So
        // preserveDrawingBuffer can stay false.
        preserveDrawingBuffer: false,
      },
      extensions: ["OES_standard_derivatives"],
    });
  } catch (err) {
    console.error("[halftone-canvas] regl init failed:", err);
    return null;
  }

  // FBO starts 1x1; resized to match gridRes each frame.
  const fbo = regl.framebuffer({
    width: 1,
    height: 1,
    colorType: "uint8",
    colorFormat: "rgba",
    depth: false,
    stencil: false,
  });

  const quad = regl.buffer([
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]);

  // --- Pass 1: field shader -> FBO ---
  // Discover field uniform names lazily at first draw (they depend on
  // which shader is passed in). We build this command on first frame.
  let fieldCommand: HalftoneState["field"] | null = null;
  const buildField = (uniformNames: readonly string[]): HalftoneState["field"] => {
    const uniforms: Record<string, REGL.DynamicVariable<UniformValue>> = {};
    for (const name of uniformNames) {
      uniforms[name] = regl.prop<FieldUniformProps, string>(name);
    }
    return regl({
      frag: SHARED_SNOISE + frag,
      vert: SHARED_VERT,
      attributes: { aPos: quad },
      uniforms,
      count: 4,
      primitive: "triangle strip",
      framebuffer: fbo,
      depth: { enable: false, mask: false },
      cull: { enable: false },
      blend: { enable: false },
    });
  };

  // --- Pass 2: halftone dots -> default framebuffer (canvas) ---
  const dots = regl<object, object, DotUniformProps>({
    frag: FRAG_DOTS,
    vert: SHARED_VERT,
    attributes: { aPos: quad },
    uniforms: {
      uField: regl.prop<DotUniformProps, "uField">("uField"),
      uCanvasSize: regl.prop<DotUniformProps, "uCanvasSize">("uCanvasSize"),
      uGridSize: regl.prop<DotUniformProps, "uGridSize">("uGridSize"),
      uStep: regl.prop<DotUniformProps, "uStep">("uStep"),
      uContrast: regl.prop<DotUniformProps, "uContrast">("uContrast"),
      uDotColor: regl.prop<DotUniformProps, "uDotColor">("uDotColor"),
      uEdgeMargin: regl.prop<DotUniformProps, "uEdgeMargin">("uEdgeMargin"),
    },
    count: 4,
    primitive: "triangle strip",
    depth: { enable: false, mask: false },
    cull: { enable: false },
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha",
        srcAlpha: 1,
        dstRGB: "one minus src alpha",
        dstAlpha: "one minus src alpha",
      },
    },
  });

  const state: HalftoneState = {
    regl,
    // field starts as a throwaway; replaced on first frame.
    field: null as unknown as HalftoneState["field"],
    dots,
    fbo,
    pixels: new Uint8Array(4),
    lastGridCols: 0,
    lastGridRows: 0,
    lastCanvasW: 0,
    lastCanvasH: 0,
  };

  // Close over lazy builder so the loop can wire it up on first getUniforms.
  Object.defineProperty(state, "_buildField", {
    value: buildField,
    enumerable: false,
  });
  Object.defineProperty(state, "_setField", {
    value: (cmd: HalftoneState["field"]) => {
      fieldCommand = cmd;
      state.field = cmd;
    },
    enumerable: false,
  });
  Object.defineProperty(state, "_fieldCommand", {
    get: () => fieldCommand,
    enumerable: false,
  });

  byFrag.set(frag, state);
  return state;
}

/**
 * Single-canvas WebGL halftone pipeline.
 *
 * Replaces the useShaderCanvas + useDotRaster pair for halftone-dot surfaces.
 * Field + dots are both rendered on GPU in one regl instance — no Canvas2D,
 * no CPU-side arc() loop, no IPC bottleneck in Firefox's OOPC CanvasRenderer.
 *
 * See `FRAG_DOTS` in ./shaders.ts for the dot-rendering shader.
 */
export function useHalftoneCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: UseHalftoneCanvasOpts,
): void {
  const optsRef = useLatestRef(opts);
  const { frag, dprCap = 2 } = opts;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = getOrCreateState(canvas, frag);
    if (!state) return;
    const { regl, fbo, dots } = state;
    const gl = regl._gl;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        state.lastCanvasW = w;
        state.lastCanvasH = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let frames = 0;
    let lastFpsMark = performance.now();

    const tick = regl.frame(() => {
      const o = optsRef.current;
      if (o.paused?.()) return;

      // --- Sync grid / FBO size ---
      const grid = o.gridRes();
      const gCols = Math.max(1, grid.cols);
      const gRows = Math.max(1, grid.rows);
      if (gCols !== state.lastGridCols || gRows !== state.lastGridRows) {
        fbo.resize(gCols, gRows);
        state.lastGridCols = gCols;
        state.lastGridRows = gRows;
        if (o.onHistogram) {
          state.pixels = new Uint8Array(gCols * gRows * 4);
        }
      }

      // --- Gather field uniforms ---
      const fieldUniforms = o.getUniforms();

      // Build field command lazily on the first draw (uniform names are
      // discovered from what the caller passes, consistent with
      // useShaderCanvas's design).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyState = state as any;
      if (!anyState._fieldCommand) {
        anyState._setField(anyState._buildField(Object.keys(fieldUniforms)));
      }

      const t0 = performance.now();

      // --- Pass 1: render field into FBO ---
      state.field(fieldUniforms);

      // --- Pass 2: render dots from FBO to canvas ---
      // Parse dot color each frame — cheap; matches the previous behaviour
      // of reading computed style (which supports theme switches live).
      let colorCss = o.getDotColor?.();
      if (!colorCss) {
        colorCss = getComputedStyle(canvas).color || "#000";
      }
      const rgb = parseCssColor(colorCss);

      const W = state.lastCanvasW;
      const H = state.lastCanvasH;
      const dpr = W / Math.max(1, canvas.getBoundingClientRect().width);
      const step = (o.step ?? DOT_STEP) * dpr;

      dots({
        uField: fbo,
        uCanvasSize: [W, H] as const,
        uGridSize: [gCols, gRows] as const,
        uStep: step,
        uContrast: o.getContrast(),
        uDotColor: rgb,
        uEdgeMargin: DOT_MAX_RADIUS * dpr,
      });

      // --- Histogram readback (every 4th frame) ---
      if (o.onHistogram && (frames & 3) === 0 && state.pixels.length === gCols * gRows * 4) {
        gl.bindFramebuffer(
          gl.FRAMEBUFFER,
          // regl exposes the WebGL FBO on _framebuffer
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fbo as any)._framebuffer?.framebuffer ?? null,
        );
        gl.readPixels(
          0,
          0,
          gCols,
          gRows,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          state.pixels,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const hist = new Uint32Array(256);
        for (let i = 0; i < state.pixels.length; i += 4) {
          hist[state.pixels[i]]++;
        }
        o.onHistogram(hist);
      }

      // --- FPS / GPU-ms telemetry ---
      const gpuMs = performance.now() - t0;
      frames++;
      const now = performance.now();
      if (now - lastFpsMark >= 1000) {
        const fps = (frames * 1000) / (now - lastFpsMark);
        frames = 0;
        lastFpsMark = now;
        o.onFrame?.(fps, gpuMs);
      }
    });

    return () => {
      tick.cancel();
      ro.disconnect();
      // Don't destroy regl — canvas may be reused on remount (WeakMap).
    };
  }, [frag, canvasRef, dprCap, optsRef]);
}
