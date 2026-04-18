"use client";

import { useEffect, useRef } from "react";
import { mapLayers } from "../_lib/constants";
import { useHalftoneLab } from "../_lib/use-halftone-state";

function mapY(v: number, H: number): number {
  const VMIN = -1.5;
  const VMAX = 2.5;
  return H - ((v - VMIN) / (VMAX - VMIN)) * H;
}

export function WavePlot() {
  const { stateRef } = useHalftoneLab();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(r.width));
      H = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const t0 = performance.now();
    const localTime = { v: 0 };
    let lastNow = t0;

    const frame = (now: number) => {
      const s = stateRef.current.tweaks;
      const dt = Math.min((now - lastNow) / 1000, 1 / 30);
      lastNow = now;
      localTime.v += dt * s.timeScale;
      const t = localTime.v;
      const layers = mapLayers(s.orbitCount);

      const cs = getComputedStyle(canvas);
      const strokeMain = cs.getPropertyValue("color") || "#000";
      const accent = cs.getPropertyValue("--halftone-accent") || "#2563eb";
      const bandFill = cs.getPropertyValue("--halftone-accent-soft") || "#dbeafe";
      const muted = cs.getPropertyValue("--muted-foreground") || "#a1a1aa";
      const borderCol = cs.getPropertyValue("--border") || "#e5e5e5";

      ctx.clearRect(0, 0, W, H);

      const a = 0.0;
      const d = 0.7;
      const tt = t * s.rippleSpeed * Math.PI;
      const freq = s.rippleFreq;
      const s1 = -0.1;
      const s2 = s1 + Math.sin(tt - d * freq * 0.6) * 0.1 + 0.15;

      // band
      const yTop = mapY(s2, H);
      const yBot = mapY(s1, H);
      ctx.fillStyle = bandFill.trim();
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, yTop, W, yBot - yTop);
      ctx.globalAlpha = 1;

      // zero line
      ctx.strokeStyle = borderCol.trim();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mapY(0, H));
      ctx.lineTo(W, mapY(0, H));
      ctx.stroke();

      // curve
      ctx.strokeStyle = strokeMain.trim();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      for (let x = 0; x < W; x++) {
        const ki = (x / W) * Math.PI * 2;
        const v =
          Math.sin(a * 3.0 - tt + Math.sin(ki - tt) * 2.5) * 0.1 * d +
          (d - ki * 0.4);
        const y = mapY(v, H);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // markers
      ctx.fillStyle = accent.trim();
      for (let k = 0; k < Math.min(layers, 64); k++) {
        const ki2 = (k / layers) * (Math.PI * 2);
        const mx = (ki2 / (Math.PI * 2)) * W;
        const my = mapY(
          Math.sin(a * 3 - tt + Math.sin(ki2 - tt) * 2.5) * 0.1 * d +
            (d - ki2 * 0.4),
          H,
        );
        ctx.beginPath();
        ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = muted.trim();
      ctx.font = "10px var(--font-jetbrains), ui-monospace, monospace";
      ctx.textBaseline = "top";
      ctx.fillText("v(k) along d=0.7, a=0", 8, 6);
      ctx.textBaseline = "bottom";
      ctx.fillText("k = 0", 8, H - 6);
      ctx.textAlign = "right";
      ctx.fillText("k = 2π", W - 8, H - 6);
      ctx.textAlign = "left";

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stateRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label="1D wave function visualization"
    />
  );
}
