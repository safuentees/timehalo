"use client";

import createREGL from "regl";
import type REGL from "regl";
import { useEffect, type RefObject } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { SHARED_SNOISE, SHARED_VERT } from "./shaders";

export type UniformValue = number | readonly [number, number] | readonly [number, number, number];

export type UseShaderCanvasOpts = {
  frag: string;
  getUniforms: () => Record<string, UniformValue>;
  /** Ignored. regl auto-detects int vs float from shader introspection. */
  intUniforms?: readonly string[];
  onFrame?: (fps: number, gpuMs: number) => void;
  dprCap?: number;
  gridRes?: () => { cols: number; rows: number };
  paused?: () => boolean;
  onPixels?: (pixels: Uint8Array, w: number, h: number, frameIdx: number) => void;
};

type UniformProps = Record<string, UniformValue>;

type FragState = {
  draw: REGL.DrawCommand<REGL.DefaultContext, UniformProps>;
  pixels: Uint8Array | null;
  lastW: number;
  lastH: number;
};

type CanvasState = {
  regl: REGL.Regl;
  byFrag: Map<string, FragState>;
};

// Next's router cache can keep canvas DOM elements alive across navigations.
// Cache the regl instance per canvas (and the compiled draw command per frag)
// so a re-mounted effect reuses what already exists instead of trying to
// initialize on top of a live context. Browser GC reclaims when the canvas
// is actually detached from the document.
const cache: WeakMap<HTMLCanvasElement, CanvasState> = new WeakMap();

function getOrCreateState(canvas: HTMLCanvasElement, frag: string): { regl: REGL.Regl; fragState: FragState } | null {
  let canvasState = cache.get(canvas);
  if (!canvasState) {
    let regl: REGL.Regl;
    try {
      regl = createREGL({
        canvas,
        attributes: {
          antialias: false,
          premultipliedAlpha: false,
          alpha: true,
          // regl.read() from the default framebuffer requires this to be true
          // (raw WebGL is lenient about same-frame readback; regl is strict).
          // Cost is negligible for our small offscreen canvases.
          preserveDrawingBuffer: true,
        },
        extensions: ["OES_standard_derivatives"],
      });
    } catch (err) {
      console.error("[shader-canvas] regl init failed:", err);
      return null;
    }
    canvasState = { regl, byFrag: new Map() };
    cache.set(canvas, canvasState);
  }

  let fragState = canvasState.byFrag.get(frag);
  if (!fragState) {
    fragState = {
      draw: null as unknown as FragState["draw"], // built lazily after first getUniforms() call
      pixels: null,
      lastW: 0,
      lastH: 0,
    };
    canvasState.byFrag.set(frag, fragState);
  }

  return { regl: canvasState.regl, fragState };
}

function buildDraw(regl: REGL.Regl, frag: string, uniformNames: readonly string[]): FragState["draw"] {
  const uniforms: Record<string, REGL.DynamicVariable<UniformValue>> = {};
  for (const name of uniformNames) {
    uniforms[name] = regl.prop<UniformProps, string>(name);
  }
  return regl({
    frag: SHARED_SNOISE + frag,
    vert: SHARED_VERT,
    attributes: {
      aPos: regl.buffer([
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]),
    },
    uniforms,
    count: 4,
    primitive: "triangle strip",
  });
}

/**
 * Thin wrapper driving a full-screen fragment shader on `canvasRef` via regl.
 *
 * Public API is unchanged from the previous raw-WebGL implementation. All
 * callbacks (`getUniforms`, `onFrame`, `paused`, `onPixels`, `gridRes`) are
 * read fresh each frame via a latest-ref internal so callers can pass inline
 * arrow functions without `useCallback`.
 *
 * Re-init is gated on `frag` changes (recompile path). The regl instance and
 * draw command are cached per canvas so client-side navigation that reuses
 * the canvas DOM does not invalidate the GL context.
 */
export function useShaderCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: UseShaderCanvasOpts,
): void {
  const optsRef = useLatestRef(opts);
  const { frag, dprCap = 2 } = opts;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = getOrCreateState(canvas, frag);
    if (!state) return;
    const { regl, fragState } = state;

    const resize = () => {
      const o = optsRef.current;
      let w: number;
      let h: number;
      if (o.gridRes) {
        const r = o.gridRes();
        w = Math.max(1, r.cols);
        h = Math.max(1, r.rows);
      } else {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        w = Math.max(1, Math.floor(rect.width * dpr));
        h = Math.max(1, Math.floor(rect.height * dpr));
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        fragState.lastW = w;
        fragState.lastH = h;
        if (o.onPixels) {
          fragState.pixels = new Uint8Array(w * h * 4);
        }
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    if (!optsRef.current.gridRes) ro.observe(canvas);

    let raf = 0;
    let frames = 0;
    let lastFpsMark = performance.now();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const o = optsRef.current;
      if (o.gridRes) resize();
      if (o.paused?.()) return;

      const uniforms = o.getUniforms();

      // Lazy compile on first frame: discover the uniform name set from
      // what the caller actually passes, then build a draw command bound
      // to those names.
      if (!fragState.draw) {
        fragState.draw = buildDraw(regl, frag, Object.keys(uniforms));
      }

      regl.poll();

      const t0 = performance.now();
      fragState.draw(uniforms);

      let gpuMs: number;
      if (o.onPixels && fragState.pixels) {
        regl.read({
          x: 0,
          y: 0,
          width: fragState.lastW,
          height: fragState.lastH,
          data: fragState.pixels,
        });
        gpuMs = performance.now() - t0;
        o.onPixels(fragState.pixels, fragState.lastW, fragState.lastH, frames);
      } else {
        // _gl is regl's documented escape hatch for advanced cases.
        regl._gl.finish();
        gpuMs = performance.now() - t0;
      }

      frames++;
      const now = performance.now();
      if (now - lastFpsMark >= 1000) {
        const fps = (frames * 1000) / (now - lastFpsMark);
        frames = 0;
        lastFpsMark = now;
        o.onFrame?.(fps, gpuMs);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // Intentionally do NOT call regl.destroy() — Next's router-cache can
      // reuse this canvas DOM across navigations, and a forced destroy
      // would leave a dead WebGL context behind for the next mount.
    };
  }, [frag, canvasRef, dprCap, optsRef]);
}
