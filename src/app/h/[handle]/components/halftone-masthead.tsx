"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// Live halftone canvas for brand surfaces. Two roles:
//   1. Masthead behind the host's name/bio on /h/[handle] (Tier A #2).
//   2. Density strip above the bookings list, encoding booking
//      volume per day (Tier C #7).
//
// Performance contract:
//   - Canvas2D, NOT WebGL — sub-30fps animation, simple math, no
//     shader pipeline. Easier to reason about, lower battery drain.
//   - IntersectionObserver gated: pauses the rAF loop when off-screen.
//   - prefers-reduced-motion: reduce → renders ONE static frame and
//     stops the loop entirely.
//   - DPR-aware so dots render crisply on retina without burning 4×
//     the pixels.
//
// `seed` keeps the field deterministic across renders (no flicker on
// re-render). Pass a hash of the handle for per-host signature.
//
// `density` is an optional 0..1 array. When present, it modulates the
// per-column dot radius — high-density days get fatter dots. The array
// length doesn't have to match GRID_X; we sample by normalized index.

type Props = {
  /** CSS class on the wrapping <div>. Caller controls sizing AND positioning. */
  className?: string;
  /** Stable seed; same value = same wave field. Defaults to a constant. */
  seed?: number;
  /**
   * Per-column density values in [0, 1]. Length is independent of GRID_X.
   * Higher values produce fatter dots in that column. Empty/undefined =
   * uniform field. Empty buckets still render at a baseline floor so the
   * surface never goes fully blank.
   */
  density?: number[];
  /** Override grid resolution. Defaults: 36×9 (masthead). Strip uses fewer rows. */
  gridX?: number;
  gridY?: number;
  /** Override fill alpha. Defaults: 0.18. Strip can go louder for legibility. */
  alpha?: number;
  /** Override max/min dot radius (px at DPR=1). */
  maxR?: number;
  minR?: number;
};

const DEFAULT_GRID_X = 36;
const DEFAULT_GRID_Y = 9;
const DEFAULT_MAX_R = 3.6;
const DEFAULT_MIN_R = 0.6;
const DEFAULT_ALPHA = 0.18;

// When density is provided, empty buckets still get this fraction of the
// max radius — keeps the surface from going abruptly blank on quiet days.
const DENSITY_FLOOR = 0.18;

export function HalftoneMasthead({
  className,
  seed = 7,
  density,
  gridX = DEFAULT_GRID_X,
  gridY = DEFAULT_GRID_Y,
  alpha = DEFAULT_ALPHA,
  maxR = DEFAULT_MAX_R,
  minR = DEFAULT_MIN_R,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  // Stable density ref so the effect doesn't re-run on every parent
  // re-render. Density updates happen in-place through the ref.
  const densityRef = useRef<number[] | undefined>(density);
  useEffect(() => {
    densityRef.current = density;
  }, [density]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let inView = true;
    let raf = 0;
    let start = performance.now();

    function resize() {
      if (!canvas || !ctx || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Read --bru-ink from CSS so the canvas color follows theme flips.
    function inkColor() {
      if (!wrap) return "rgb(10,10,10)";
      const c = getComputedStyle(wrap).getPropertyValue("--bru-ink").trim();
      return c || "rgb(10,10,10)";
    }

    function densityAtCol(col: number): number {
      const d = densityRef.current;
      if (!d || d.length === 0) return 1;
      // Map column → bucket index in the density array.
      const u = gridX <= 1 ? 0 : col / (gridX - 1);
      const idx = Math.min(d.length - 1, Math.max(0, Math.floor(u * d.length)));
      const raw = d[idx] ?? 0;
      const clamped = Math.max(0, Math.min(1, raw));
      return DENSITY_FLOOR + (1 - DENSITY_FLOOR) * clamped;
    }

    function draw(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const stepX = width / gridX;
      const stepY = height / gridY;
      const offsetX = stepX / 2;
      const offsetY = stepY / 2;

      const phase = (t - start) / 1000; // seconds since mount
      ctx.fillStyle = inkColor();
      ctx.globalAlpha = alpha;

      for (let row = 0; row < gridY; row++) {
        for (let col = 0; col < gridX; col++) {
          const u = gridX <= 1 ? 0 : col / (gridX - 1);
          const v = gridY <= 1 ? 0 : row / (gridY - 1);
          // Two slow waves crossing each other + a tiny seeded jitter
          // so re-renders with the same seed produce the same field.
          const wave =
            0.5 +
            0.5 *
              Math.cos(
                (u * 4.2 - v * 1.8) * Math.PI + phase * 0.45,
              );
          const swirl =
            0.5 +
            0.5 *
              Math.sin((u + v) * Math.PI * 1.3 - phase * 0.32 + seed * 0.31);
          const f = wave * 0.65 + swirl * 0.35;
          const dMul = densityAtCol(col);
          const r = minR + f * (maxR - minR) * dMul;
          ctx.beginPath();
          ctx.arc(
            offsetX + col * stepX,
            offsetY + row * stepY,
            r,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }

    function tick(t: number) {
      if (!inView) return;
      draw(t);
      raf = requestAnimationFrame(tick);
    }

    // Initial sizing + first paint
    resize();
    draw(performance.now());

    if (reduced) {
      // Static — skip the rAF loop entirely. One-and-done.
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) {
          start = performance.now();
          raf = requestAnimationFrame(tick);
        } else if (raf) {
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.01 },
    );
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(wrap);

    if (inView) raf = requestAnimationFrame(tick);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, seed, gridX, gridY, alpha, maxR, minR]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={className}
      style={{ pointerEvents: "none", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
