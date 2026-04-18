"use client";

import { useEffect, useRef } from "react";
import { useHalftoneLab } from "../_lib/use-halftone-state";
import type { PanelKey } from "../_lib/constants";

type Props = {
  panelKey: PanelKey;
  showDrift?: boolean;
};

export function OverlaySVG({ panelKey, showDrift = false }: Props) {
  const { mouseRef, stateRef } = useHalftoneLab();
  const crosshairRef = useRef<SVGGElement | null>(null);
  const driftRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const m = mouseRef.current;
      const cx = m.x * 100;
      const cy = m.y * 100;

      const crosshair = crosshairRef.current;
      if (crosshair) {
        crosshair.setAttribute(
          "transform",
          `translate(${cx.toFixed(3)} ${cy.toFixed(3)})`,
        );
        crosshair.setAttribute(
          "opacity",
          m.hovering && m.activePanel === panelKey ? "1" : "0.35",
        );
      }

      if (showDrift && driftRef.current) {
        const drift = stateRef.current.tweaks.orbitSpeed;
        const len = Math.max(-0.6, Math.min(0.6, drift)) * 18;
        driftRef.current.setAttribute("x2", (50 + len).toFixed(3));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mouseRef, panelKey, showDrift, stateRef]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {/* axes */}
      <line
        x1="50"
        y1="0"
        x2="50"
        y2="100"
        stroke="var(--halftone-accent)"
        strokeWidth="0.15"
        opacity="0.3"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="0"
        y1="50"
        x2="100"
        y2="50"
        stroke="var(--halftone-accent)"
        strokeWidth="0.15"
        opacity="0.3"
        vectorEffect="non-scaling-stroke"
      />

      {/* drift arrow */}
      {showDrift ? (
        <g>
          <line
            ref={driftRef}
            x1="50"
            y1="50"
            x2="62"
            y2="50"
            stroke="var(--halftone-accent)"
            strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx="50" cy="50" r="0.8" fill="var(--halftone-accent)" />
        </g>
      ) : null}

      {/* crosshair */}
      <g ref={crosshairRef} opacity="0.35">
        <circle
          r="2.2"
          fill="none"
          stroke="var(--halftone-accent)"
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="-4"
          y1="0"
          x2="-2.5"
          y2="0"
          stroke="var(--halftone-accent)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="2.5"
          y1="0"
          x2="4"
          y2="0"
          stroke="var(--halftone-accent)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="-4"
          x2="0"
          y2="-2.5"
          stroke="var(--halftone-accent)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="2.5"
          x2="0"
          y2="4"
          stroke="var(--halftone-accent)"
          strokeWidth="0.25"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
