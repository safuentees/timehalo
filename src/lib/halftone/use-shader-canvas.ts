"use client";

import { useEffect, type RefObject } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { SHARED_SNOISE, SHARED_VERT } from "./shaders";

export type UniformValue = number | readonly [number, number] | readonly [number, number, number];

export type UseShaderCanvasOpts = {
  frag: string;
  getUniforms: () => Record<string, UniformValue>;
  intUniforms?: readonly string[];
  onFrame?: (fps: number, gpuMs: number) => void;
  dprCap?: number;
  gridRes?: () => { cols: number; rows: number };
  paused?: () => boolean;
  onPixels?: (pixels: Uint8Array, w: number, h: number, frameIdx: number) => void;
};

type Compiled = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniformLocs: Map<string, WebGLUniformLocation | null>;
  lastW: number;
  lastH: number;
  pixels: Uint8Array | null;
  frag: string;
};

const compiledByCanvas: WeakMap<HTMLCanvasElement, Compiled> = new WeakMap();

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[shader-canvas] compile:", gl.getShaderInfoLog(sh));
    console.error(src);
    return null;
  }
  return sh;
}

function init(canvas: HTMLCanvasElement, frag: string): Compiled | null {
  const cached = compiledByCanvas.get(canvas);
  if (cached && cached.frag === frag && !cached.gl.isContextLost()) {
    return cached;
  }

  const gl =
    (canvas.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
      alpha: true,
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null) ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
  if (!gl || gl.isContextLost()) return null;
  gl.getExtension("OES_standard_derivatives");

  const vs = compile(gl, gl.VERTEX_SHADER, SHARED_VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, SHARED_SNOISE + frag);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[shader-canvas] link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const compiled: Compiled = {
    gl,
    program,
    uniformLocs: new Map(),
    lastW: 0,
    lastH: 0,
    pixels: null,
    frag,
  };
  compiledByCanvas.set(canvas, compiled);
  return compiled;
}

function getUniformLoc(c: Compiled, name: string): WebGLUniformLocation | null {
  const cached = c.uniformLocs.get(name);
  if (cached !== undefined) return cached;
  const loc = c.gl.getUniformLocation(c.program, name);
  c.uniformLocs.set(name, loc);
  return loc;
}

function setUniform(
  c: Compiled,
  name: string,
  value: UniformValue,
  asInt: boolean,
) {
  const loc = getUniformLoc(c, name);
  if (loc === null) return;
  const { gl } = c;
  if (typeof value === "number") {
    if (asInt) gl.uniform1i(loc, value | 0);
    else gl.uniform1f(loc, value);
  } else if (value.length === 2) {
    gl.uniform2f(loc, value[0], value[1]);
  } else if (value.length === 3) {
    gl.uniform3f(loc, value[0], value[1], value[2]);
  }
}

export function useShaderCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: UseShaderCanvasOpts,
): void {
  const optsRef = useLatestRef(opts);
  const { frag, intUniforms, dprCap = 2 } = opts;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const compiled = init(canvas, frag);
    if (!compiled) return;

    const intSet = new Set(intUniforms ?? []);
    const { gl } = compiled;

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
        compiled.lastW = w;
        compiled.lastH = h;
        if (o.onPixels) {
          compiled.pixels = new Uint8Array(w * h * 4);
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
      for (const name in uniforms) {
        setUniform(compiled, name, uniforms[name], intSet.has(name));
      }

      const t0 = performance.now();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      let gpuMs: number;
      if (o.onPixels && compiled.pixels) {
        gl.readPixels(
          0,
          0,
          compiled.lastW,
          compiled.lastH,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          compiled.pixels,
        );
        gpuMs = performance.now() - t0;
        o.onPixels(compiled.pixels, compiled.lastW, compiled.lastH, frames);
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
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frag]);
}
