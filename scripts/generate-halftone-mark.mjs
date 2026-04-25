// One-shot generator for the brand mark — outputs a static halftone
// SVG to `public/halftone-mark.svg`. The mark is a 9x9 grid of dots
// whose radii follow a wave + noise field, deterministic given the
// SEED so re-runs produce the same file (commit-safe).
//
// Run with:  pnpm node scripts/generate-halftone-mark.mjs
//
// Re-run with a different SEED in this file when you want a fresh
// "pose" — the file is committed, runtime cost is zero.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SEED = 7;
const SIZE = 64; // viewBox edge in px
const GRID = 9; // dots per side (9x9 = 81 dots)
const PADDING = 4; // margin from edge to first dot
const MAX_R = 4.2; // max dot radius
const MIN_R = 0.4; // min dot radius
const INK = "currentColor"; // honors text color of the parent

// Deterministic pseudo-noise — small mulberry32 PRNG seeded by SEED so
// the field is identical every run. We don't need true simplex noise;
// we just want a smooth-ish heightmap across 9 cells.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const noise = Array.from({ length: GRID }, () =>
  Array.from({ length: GRID }, () => rand()),
);

// Smooth-ish field: combine noise with a low-frequency cosine wave so
// the dots have a coherent "ridge" through them, not pure white noise.
function fieldAt(col, row) {
  const u = col / (GRID - 1);
  const v = row / (GRID - 1);
  const wave = 0.5 + 0.5 * Math.cos((u * 1.7 - v * 1.1) * Math.PI);
  return wave * 0.6 + noise[row][col] * 0.4;
}

const step = (SIZE - PADDING * 2) / (GRID - 1);
const circles = [];
for (let row = 0; row < GRID; row++) {
  for (let col = 0; col < GRID; col++) {
    const cx = PADDING + col * step;
    const cy = PADDING + row * step;
    const f = fieldAt(col, row);
    const r = MIN_R + f * (MAX_R - MIN_R);
    circles.push(
      `  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" />`,
    );
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" fill="${INK}" aria-hidden="true">
${circles.join("\n")}
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "halftone-mark.svg");
writeFileSync(out, svg);
console.log(`Wrote ${out}  (${circles.length} dots, seed ${SEED})`);
