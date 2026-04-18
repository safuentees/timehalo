"use client";

import { useEffect, useRef, type RefObject } from "react";

const DEFAULT_STEP = 14;

export type UseDotRasterOpts = {
  getPixels: () => Uint8Array | null;
  getGrid: () => { cols: number; rows: number };
  getStep?: () => number;
  getContrast: () => number;
  getDotColor?: () => string;
  onHistogram?: (hist: Uint32Array) => void;
};

export function useDotRaster(
  containerRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: UseDotRasterOpts,
): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = container.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(r.width));
      H = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const hist = new Uint32Array(256);
    let frames = 0;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { getPixels, getGrid, getStep, getContrast, getDotColor, onHistogram } =
        optsRef.current;

      const pixels = getPixels();
      const grid = getGrid();
      if (!pixels || grid.cols < 1 || grid.rows < 1) return;

      const step = getStep ? getStep() : DEFAULT_STEP;
      const cutoff = getContrast();
      const color =
        getDotColor?.() ??
        getComputedStyle(canvas).color ??
        "#000";

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;

      const sampleHist = (frames & 3) === 0 && onHistogram;
      if (sampleHist) hist.fill(0);

      const cols = grid.cols;
      const rows = grid.rows;

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // WebGL readPixels returns origin = bottom-left; flip row for screen.
          const srcRow = rows - 1 - j;
          const idx = (srcRow * cols + i) * 4;
          const r = pixels[idx] ?? 0;
          if (sampleHist) hist[r]++;

          const v = r / 255;
          if (v < cutoff) continue;
          const k01 = (v - cutoff) / Math.max(1 - cutoff, 1e-4);
          const radius = 0.35 + k01 * 2.3;
          const alpha = 0.12 + k01 * 0.6;

          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(i * step + step * 0.5, j * step + step * 0.5, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (sampleHist) onHistogram!(hist);
      frames++;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef, containerRef]);
}
