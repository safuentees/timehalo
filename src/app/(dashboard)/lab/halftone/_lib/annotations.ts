import type { PanelKey } from "./constants";

export type Annotation = { line: number; note: string };

export const A_ANNOTATED: readonly Annotation[] = [
  {
    line: 12,
    note: "Center coords on (0,0), then stretch x by aspect so the short axis is the unit length. This is the only line that 'knows' about container shape.",
  },
  {
    line: 16,
    note: "Squeeze x back toward 1/aspect when uRound=0, so concentric rings become ellipses that fit a wide container. uRound=1 keeps true circles.",
  },
  {
    line: 20,
    note: "Polar coords: angle 'a' and radius 'd'. The whole shader operates on these, which is why the pattern is naturally radial.",
  },
  {
    line: 24,
    note: "s1/s2 define the two edges of each accumulated band. The sin(t - d*freq) makes s2 pulse in/out over time, creating the traveling-ring look.",
  },
  {
    line: 30,
    note: "Big idea: each of the 128 layers is a shifted copy of the same wave with its own phase 'ki'. When they stack, constructive/destructive interference paints the field.",
  },
  {
    line: 33,
    note: "Loop limit must be a compile-time constant in WebGL1. 128 is the hard max; the 'break' lets us render fewer layers dynamically via uLayers.",
  },
  {
    line: 36,
    note: "The wobble-within-wobble: inner sin(ki-t) modulates the phase of the outer sin, which is what makes the field breathe and slowly rotate rather than just oscillate.",
  },
  {
    line: 37,
    note: "fwidth() is the per-pixel rate of change of v. Feeding it to smoothstep gives free anti-aliasing at band edges.",
  },
  {
    line: 42,
    note: "In isolate mode the panel shows only the current (last) layer's contribution so you can see what a single sin wave looks like before stacking.",
  },
  {
    line: 46,
    note: "Final field: sum divided by layer count to normalize back into [0,1].",
  },
] as const;

export const B_ANNOTATED: readonly Annotation[] = [
  {
    line: 9,
    note: "Same aspect-aware coords as panel A - every layer in the pipeline uses the same coordinate system.",
  },
  {
    line: 10,
    note: "Scale up before sampling fBm - determines the feature size of the noise.",
  },
  {
    line: 15,
    note: "Domain warp, the key idea. First fbm() call gives us a scalar field; we sample two of them (with offset seeds) to build a 2D vector.",
  },
  {
    line: 18,
    note: "Subtracting 0.5 centers the warp vector around zero, so on average it pushes coords neither direction.",
  },
  {
    line: 23,
    note: "If 'show warp' is on, we bail out and draw the warp vector itself - red/green channels show the x/y components, revealing the flow field.",
  },
  {
    line: 27,
    note: "uSwirl * 4 is the final amplitude of the warp. Higher = more distorted blobs. At 0 you get plain fBm, no swirl.",
  },
  {
    line: 28,
    note: "The time offset here makes the WHOLE field drift slowly, independent of the warp - gives the base noise its slow crawl.",
  },
] as const;

export const C_ANNOTATED: readonly Annotation[] = [
  {
    line: 21,
    note: "Cursor warp: we compute the vector from mouse to current pixel, then pull the pixel toward the mouse by an amount that falls off as a Gaussian of distance. uMouseWarp is the max pull strength at distance 0.",
  },
  {
    line: 29,
    note: "Horizontal drift - simply subtract time*speed from uv.x so the entire field flows left to right over time.",
  },
  {
    line: 32,
    note: "From here down it's panel A's wave math again - unchanged. We run it in parallel with panel B's fBm, then linearly blend the results.",
  },
  {
    line: 58,
    note: "This is the single line where A and B become one field. Two scalar sliders control the mix - zero either to see the other in isolation.",
  },
  {
    line: 62,
    note: "Vignette is a simple radial smoothstep: solid near the center, fading as r grows. Prevents the field from reaching hard-cut edges.",
  },
  {
    line: 68,
    note: "Multiplication rather than subtraction so the vignette darkens existing dot density, rather than adding/subtracting brightness.",
  },
] as const;

export const PANEL_ANNOTATIONS: Record<PanelKey, readonly Annotation[]> = {
  A: A_ANNOTATED,
  B: B_ANNOTATED,
  C: C_ANNOTATED,
  D: C_ANNOTATED,
};
