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
  frag: string;
  getUniforms: () => Record<string, UniformValue>;
  gridRes: () => { cols: number; rows: number };
  step?: number;
  getContrast: () => number;
  getDotColor?: () => string | undefined;
  paused?: () => boolean;
  onFrame?: (fps: number, gpuMs: number) => void;
  onHistogram?: (hist: Uint32Array) => void;
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

const cache: WeakMap<HTMLCanvasElement, Map<string, HalftoneState>> =
  new WeakMap();

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
        preserveDrawingBuffer: false,
      },
      extensions: ["OES_standard_derivatives"],
    });
  } catch (err) {
    console.error("[halftone-canvas] regl init failed:", err);
    return null;
  }

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
    field: null as unknown as HalftoneState["field"],
    dots,
    fbo,
    pixels: new Uint8Array(4),
    lastGridCols: 0,
    lastGridRows: 0,
    lastCanvasW: 0,
    lastCanvasH: 0,
  };

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

      const fieldUniforms = o.getUniforms();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyState = state as any;
      if (!anyState._fieldCommand) {
        anyState._setField(anyState._buildField(Object.keys(fieldUniforms)));
      }

      const t0 = performance.now();

      state.field(fieldUniforms);

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

      if (o.onHistogram && (frames & 3) === 0 && state.pixels.length === gCols * gRows * 4) {
        gl.bindFramebuffer(
          gl.FRAMEBUFFER,
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
    };
  }, [frag, canvasRef, dprCap, optsRef]);
}
