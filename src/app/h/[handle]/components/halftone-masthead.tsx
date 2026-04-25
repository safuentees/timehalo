"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type Props = {
  className?: string;
  seed?: number;
};

const GRID_X = 36; // dots wide
const GRID_Y = 9; // dots tall — masthead is short and wide
const MAX_R = 3.6; // px at DPR=1
const MIN_R = 0.6;

export function HalftoneMasthead({ className, seed = 7 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

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

    function inkColor() {
      if (!wrap) return "rgb(10,10,10)";
      const c = getComputedStyle(wrap).getPropertyValue("--bru-ink").trim();
      return c || "rgb(10,10,10)";
    }

    function draw(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const stepX = width / GRID_X;
      const stepY = height / GRID_Y;
      const offsetX = stepX / 2;
      const offsetY = stepY / 2;

      const phase = (t - start) / 1000; // seconds since mount
      ctx.fillStyle = inkColor();
      ctx.globalAlpha = 0.18; // quiet — masthead, not splash screen

      for (let row = 0; row < GRID_Y; row++) {
        for (let col = 0; col < GRID_X; col++) {
          const u = col / (GRID_X - 1);
          const v = row / (GRID_Y - 1);
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
          const r = MIN_R + f * (MAX_R - MIN_R);
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

    resize();
    draw(performance.now());

    if (reduced) {
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
  }, [reduced, seed]);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
