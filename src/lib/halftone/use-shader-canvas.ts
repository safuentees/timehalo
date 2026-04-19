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

// Next's router cache + React Strict Mode can keep canvas DOM elements alive
// across navigations and effect re-runs. Cache the regl instance per canvas
// (and the compiled draw command per frag) so a re-mounted effect reuses what
// already exists instead of trying to initialize on top of a live context.
// Browser GC reclaims when the canvas is actually detached.
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
          // Required for raw gl.readPixels (used below for the readback path)
          // to see the just-drawn back buffer same-frame.
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
    // Disable depth/cull/blend — fullscreen-quad fragment shaders don't
    // need any of these. Critically, regl enables depth test (func 'less')
    // by default; without an explicit depth clear each frame, the second
    // frame's quad at z=0 fails the test (0 < 0 is false) and nothing
    // renders → looks frozen on the first frame. See regl issue #444.
    depth: { enable: false, mask: false },
    cull: { enable: false },
    blend: { enable: false },
  });
}

/**
 * Thin wrapper driving a fullscreen-quad fragment shader on `canvasRef` via regl.
 *
 * Critical design point: draws are scheduled inside `regl.frame(callback)`,
 * NOT a hand-rolled `requestAnimationFrame` loop. regl batches GPU commands
 * into internal buffers that are only flushed (via `gl.flush`) by its own
 * frame scheduler. Driving draws from an external rAF leaves the commands
 * queued in regl's batch — the shader appears to render only the first frame
 * and then freezes, and `gl.readPixels` returns the stale initial buffer
 * forever after. This was a real, reproducible regression — see commit
 * 48a2bd6 for the full debugging trail.
 *
 * Public API unchanged from the raw-WebGL version. All callbacks
 * (`getUniforms`, `onFrame`, `paused`, `onPixels`, `gridRes`) are read fresh
 * each frame via a latest-ref internal so callers can pass inline arrow
 * functions without `useCallback`.
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
    const gl = regl._gl;

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
        gl.viewport(0, 0, w, h);
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

    let frames = 0;
    let lastFpsMark = performance.now();

    const tick = regl.frame(() => {
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

      const t0 = performance.now();
      fragState.draw(uniforms);

      let gpuMs: number;
      if (o.onPixels && fragState.pixels) {
        // Raw gl.readPixels rather than regl.read — direct, predictable,
        // and synchronous (forces the GPU pipeline to flush).
        gl.readPixels(
          0,
          0,
          fragState.lastW,
          fragState.lastH,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          fragState.pixels,
        );
        gpuMs = performance.now() - t0;
        o.onPixels(fragState.pixels, fragState.lastW, fragState.lastH, frames);
      } else {
        gl.finish();
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
    });

    return () => {
      tick.cancel();
      ro.disconnect();
      // Intentionally do NOT call regl.destroy() — Next's router-cache can
      // reuse this canvas DOM across navigations, and a forced destroy
      // would leave a dead WebGL context for the next mount. The cached
      // regl instance lives in the WeakMap until the canvas is GC'd.
    };
  }, [frag, canvasRef, dprCap, optsRef]);
}
