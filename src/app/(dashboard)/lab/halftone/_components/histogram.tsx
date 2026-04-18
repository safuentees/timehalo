"use client";

import { useEffect, useRef } from "react";
import { useHalftoneLab } from "../_lib/use-halftone-state";
import { useHistogram } from "../_lib/use-halftone-telemetry";

export function Histogram() {
  const { stateRef } = useHalftoneLab();
  const data = useHistogram();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let DPR = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
      const cs = getComputedStyle(canvas);
      const muted = cs.getPropertyValue("--muted-foreground") || "#a1a1aa";
      const fg = cs.getPropertyValue("--foreground") || "#000";
      const fillCol = cs.getPropertyValue("--border") || "#d4d4d8";
      const cutCol = cs.getPropertyValue("--halftone-accent") || "#ef4444";
      const contrast = stateRef.current.tweaks.contrast;

      ctx.clearRect(0, 0, W, H);

      if (!data) {
        ctx.fillStyle = muted.trim();
        ctx.font = "11px var(--font-jetbrains), ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("(waiting for composite samples)", W / 2, H / 2);
        return;
      }

      let max = 0;
      for (let i = 1; i < 256; i++) if (data[i] > max) max = data[i];
      if (max === 0) max = 1;

      const barW = W / 256;
      for (let i = 0; i < 256; i++) {
        const h = (data[i] / max) * (H - 20);
        const x = i * barW;
        const y = H - 4 - h;
        ctx.fillStyle =
          i / 255 < contrast ? muted.trim() : fillCol.trim();
        ctx.fillRect(x, y, Math.max(1, barW - 0.25), h);
      }

      const cutX = contrast * W;
      ctx.strokeStyle = cutCol.trim();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cutX, 2);
      ctx.lineTo(cutX, H - 2);
      ctx.stroke();

      ctx.fillStyle = muted.trim();
      ctx.font = "10px var(--font-jetbrains), ui-monospace, monospace";
      ctx.textBaseline = "top";
      ctx.fillText("field distribution", 8, 6);
      ctx.textBaseline = "bottom";
      ctx.textAlign = "right";
      ctx.fillStyle = fg.trim();
      ctx.fillText(`contrast=${contrast.toFixed(2)}`, W - 8, H - 6);
      ctx.textAlign = "left";
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(r.width));
      H = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw();

    return () => ro.disconnect();
  }, [data, stateRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label="Composite field histogram"
    />
  );
}
