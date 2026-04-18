"use client";

import HalftoneHero from "./halftone-hero";
import type { HalftoneTweaks } from "@/lib/halftone-defaults";

type Props = {
  tweaks: HalftoneTweaks;
  motion: boolean;
};

export function BrutalistHero({ tweaks, motion }: Props) {
  return (
    <section className="bru-hero bru-inverted bru-hero-dotted">
      <HalftoneHero tweaks={tweaks} motion={motion} />
      <div className="bru-hero-inner">
        <h1
          className="bru-headline bru-reveal"
          style={{ ["--d" as string]: "120ms" }}
        >
          WRITING
        </h1>
        <div className="bru-hero-foot">
          <p
            className="bru-dek bru-reveal"
            style={{ ["--d" as string]: "220ms" }}
          >
            Notes on building software, frontend craft, and the occasional
            opinion nobody asked for.
          </p>
          <div
            className="bru-hero-meta bru-reveal"
            style={{ ["--d" as string]: "280ms" }}
          >
            <span>VOL · IV</span>
            <span>№ 16</span>
            <span>↓ SCROLL</span>
          </div>
        </div>
      </div>
    </section>
  );
}
