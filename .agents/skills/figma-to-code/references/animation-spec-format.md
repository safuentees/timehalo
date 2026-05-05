# Animation spec JSON — schema + recipes

`scripts/figma-extract-anim.mjs` (added in B.PT158) reads a Figma
spec produced by `pnpm figma:spec` and writes a code-friendly
animation contract to `docs/figma/anim-<feature>.json`. Implementation
code reads the JSON, NOT the live Figma. Re-running the extractor is
how you pick up design changes.

## Run it

```bash
# 1. Already done by figma:spec (Path B). Confirm:
ls docs/figma/spec-<feature>.json

# 2. Extract animations into a sibling JSON:
pnpm figma:anim <feature>
# → docs/figma/anim-<feature>.json
```

The extractor is idempotent — re-running overwrites the JSON in place.

## Output shape

```jsonc
{
  "meta": {
    "feature": "h-handle-redesign",
    "sourceSpec": "spec-h-handle-redesign.json",
    "extractedAt": "...",
    "transitionCount": 3,
    "stateSwapCount": 17
  },
  "transitions": [ /* SMART_ANIMATE + DISSOLVE + PUSH + others */ ],
  "stateSwaps":  [ /* INSTANT_TRANSITION + SWAP_STATE on hover/press */ ]
}
```

### `transitions[i]` (SMART_ANIMATE example)

```jsonc
{
  "triggerNodeId": "324:15683",
  "triggerNodeName": "handle",
  "triggerNodeType": "FRAME",
  "event": "ON_CLICK",
  "transitionType": "SMART_ANIMATE",
  "navigationType": "NAVIGATE",
  "from": { "id": "324:15683", "name": "handle" },
  "to":   { "id": "324:16654", "name": "handle-detail", "type": "FRAME" },
  "duration": 0.6502,                       // seconds
  "easingType": "GENTLE_SPRING",
  "easingFunction": [1, 247, 23.58, 0],     // raw — see "spring decoding" below
  "spring": { "mass": 1, "stiffness": 247, "damping": 23.58, "velocity": 0 },
  "sourceFrameId": "324:15683",
  "matchedLayers": 82,
  "deltaCount": 21,
  "deltas": [
    {
      "namePath": "Frame 1/Frame 15/Frame 16",
      "type": "FRAME",
      "fromId": "...",
      "toId":   "...",
      "changes": {
        "position": {
          "from": { "x": 1065, "y": 427 },
          "to":   { "x":  825, "y": 220 },
          "delta":{ "x": -240, "y":-207 }
        },
        "size":      { "from": {...}, "to": {...} },
        "opacity":   { "from": 1, "to": 0.4 },
        "cornerRadius": { "from": 25, "to": 16 },
        "fillPaints":   { "from": [...], "to": [...] }
      }
    }
    // ... 20 more
  ]
}
```

### `stateSwaps[i]` (ON_HOVER variant swap)

```jsonc
{
  "triggerNodeId": "358:20972",
  "triggerNodeName": "Component 3",
  "triggerNodeType": "INSTANCE",
  "event": "ON_HOVER",
  "transitionType": "INSTANT_TRANSITION",
  "navigationType": "SWAP_STATE",
  "from": { "id": "358:20972", "name": "Component 3" },
  "to":   { "id": "324:7811", "name": null, "type": null, "node": null, "notInSpec": true },
  "duration": 0
}
```

State swaps are no-duration variant changes. Implement as CSS hover
states + Tailwind `hover:` utilities OR React state + class swap on
`onMouseEnter` / `onMouseLeave`. No JS animation library needed.

## Spring decoding

Figma encodes `easingFunction` as a 4-tuple. Observed across all
GENTLE_SPRING captures since the kiwi pipeline went live:

```
[mass, stiffness, damping, initialVelocity]
```

Values from the visitor-page redesign:
- `[1, 247, 23.58, 0]` — `mass=1, stiffness=247, damping=23.58` → underdamped, gentle bounce, 650ms perceptual
- `[1, 330.6, 27.27, 0]` — slightly stiffer + heavier damping → snappier, less overshoot, 562ms

Both are plausible physical values for a "GENTLE_SPRING" preset. The
extractor exposes BOTH the named `spring` object AND the raw
`easingFunction` array. If a future Figma release re-orders the
tuple, you can swap interpretation in `scripts/figma-extract-anim.mjs`
without re-capturing.

Maps directly to `motion`:

```tsx
import { motion } from "motion/react";
import anim from "@/../docs/figma/anim-<feature>.json";

const t = anim.transitions[0];

<motion.div
  initial={false}
  animate={isOpen ? "open" : "closed"}
  variants={{
    closed: { x: 0, y: 0, opacity: 1 },
    open:   { x: t.deltas[0].changes.position.delta.x, y: t.deltas[0].changes.position.delta.y, opacity: t.deltas[0].changes.opacity.to },
  }}
  transition={{ type: "spring", ...t.spring }}
/>
```

Or with the `layout` prop for auto-tweened layout shifts:

```tsx
<motion.div
  layout
  transition={{ type: "spring", ...t.spring }}
  className="..."
/>
```

`<motion.div layout>` measures DOM before + after a state change and
auto-tweens position/size — you only need to swap CSS classes, the
spring transition is what motion already handles. Don't combine
manual `animate` props on the same element with `layout` — pick one.

## Layer matching (Smart Animate ground truth)

The extractor matches layers between source + destination frames by
**RELATIVE name path**, computed during a recursive walk:

- Root of a frame walk gets path `""` (empty), so frames named
  differently still match each other (handle ↔ handle-detail)
- Children get path = parent path + "/" + child layer name
- Match is by `(type, namePath)` tuple — a TEXT named "Frame 1"
  doesn't match a FRAME named "Frame 1"

This is a faithful approximation of Figma's actual Smart Animate
algorithm (sibling-position + name within parent chain). False-
positive rate is near zero on typical designs because path collisions
are rare.

If a layer SHOULD have matched but didn't:
1. Check the namePath in both frames matches exactly (case + spaces)
2. Check both layers have the same `type` (FRAME/TEXT/INSTANCE/etc.)
3. If a name was changed in one frame and not the other, fix the
   Figma file (use the same name across frames) — this is the
   designer's standard discipline for Smart Animate

## When to drop to GSAP instead

`motion`'s spring + layout system is the right pick for ~90% of port
work. Drop to GSAP when:

- You need a multi-element timeline with precise step ordering
  (cal.com `BookingsTabBar` FLIP — already in this codebase)
- Scroll-driven animation (`ScrollTrigger`)
- You need `gsap.utils` helpers for path morphing or stagger
- The animation is procedural (not state-driven) — e.g. a continuous
  marquee or parallax loop

Don't fight motion's `layout` with GSAP transforms on the same
element — pick one per element. They both rewrite `transform` and
will clash.

## Pipeline gotchas (B.PT153 / B.PT154 / B.PT158)

The kiwi pipeline went live with three latent bugs, all fixed:

- **B.PT153** — `figma-decode.mjs` was passing zstd-compressed data
  frames straight to kiwi without decompression; entire scenegraph
  came out empty. Fix: branch on `isZstdCompressed(buf)` + call
  `fzstdDecompress` before `decodePage`. **If you see "decoded 0
  pages" with valid frame captures, this regressed.**
- **B.PT154** — `figma-spec.mjs` filter walked descendants but didn't
  follow `INSTANCE.symbolID` references; component definitions
  vanished. Fix: fixed-point loop after descendant walk that adds
  referenced SYMBOL subtrees. **If you see `INSTANCE` nodes with no
  visual content in the spec, this regressed.**
- **B.PT158** — animation extraction now exists. **If you find
  yourself reading `prototypeInteractions` directly from
  `spec-*.json` in app code, you're missing the extractor — run
  `pnpm figma:anim <feature>` and read the produced JSON instead.**

Future ports run all three steps:

```bash
pnpm figma:spec <feature> --node-id=<id>   # visual + prototype
pnpm figma:anim <feature>                   # animation contract
# → both JSONs committed to docs/figma/ for diff visibility
```
