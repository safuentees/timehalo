# Postmortem: chip-morph "duration snap" debug journey (B.PT184 → B.PT193)

A 10-iteration journey to pin down a single visual artifact. Logging
it so the next time we hit a motion shared-layout bug we don't repeat
the same wrong turns.

## The bug, stated cleanly

When the modal opens (Layer 1 → Layer 2), the duration label inside
each slot ("15 min", "25 min" etc.) appears to "snap" instead of
sliding smoothly with the chip's right edge. The title text in the
same chip slides smoothly. Symptom didn't show on close in the same
way; it was direction-asymmetric.

The user also noticed: the Spring-tuning duration override (3 s
slow-mo) didn't slow the duration label's animation. The override
slowed the outer chip but the inner spans ran at a different speed
— hence the perception of "snapping" relative to a slow outer.

## What the actual root cause turned out to be

Two distinct bugs compounding:

1. **Inner motion.spans had no `transition` prop**. Without an
   explicit transition, motion falls through to the documented
   `defaultLayoutTransition = { duration: 0.45, ease: [0.4, 0, 0.1, 1] }`
   for the layout animation. The outer chip got the user's override
   (1.5 s / 3 s spring), inner spans stayed at 0.45 s ease — visible
   as a snap relative to the slow outer.

2. **Duration's screen-X position was non-monotonic during open**.
   Trace data: `pd_x` went 801 → 778 → 768 → 864 over the first
   ~120 ms. Duration moved LEFT first (toward chip center), bottomed
   at t≈33 ms, then reversed RIGHT to track the expanding right edge.
   Cause: motion's `layout="position"` + `layoutAnchor={x:0, y:0}`
   made motion run its OWN per-element layout animation interpolating
   duration's relative-to-Frame-9-LEFT position from landing-context
   value 243 to modal-context value 608. That interpolation, composed
   with Frame 9's FLIP transform, produced the left-then-right dip.

   Fix: `layoutAnchor={false}` (documented in `motion-dom/dist/index
   .d.ts:957`: *"false disables relative projection entirely"*). The
   duration now inherits Frame 9's transform via CSS without running
   its own per-element layout animation. Stays glued to Frame 9's
   right edge throughout the morph.

Title text didn't show the dip because text is at Frame 9's LEFT
edge — its relative-from-left is constant in source and dest, motion
sees no delta, no per-element animation runs.

## The journey, what we tried and why each step failed

The bug took 10 commits (B.PT184–B.PT193) plus several reverts to
nail down. Each step was a reasonable hypothesis at the time; each
was wrong for instructive reasons.

### Round 1 — B.PT184: per-frame layoutIds + opacity pin

Observation: a different bug (close-direction text fade-out at
0.7 progress). Codex/ChatGPT had already shipped a fix that put
shared `layoutId`s on the inner spans (`oh-slot-N-frame-17`,
`-frame-12`). I committed it.

What it actually fixed: the close-direction text crossfade. Worked
correctly, isolated bug. But it didn't fix the duration snap which
showed up later when the user enabled slow-mo.

### Round 2 — B.PT186: revert. Wrong move.

User reported the close-direction text glitch was "still happening
at 0.4 progress fade out then back in." I dove into motion source,
saw the auto-crossfade in `mixValues` (line 9123), drew the
conclusion that the per-frame layoutIds were causing crossfade
compounding, and reverted them.

What I missed: motion's `mixValues` has a `!path.some(hasOpacity
Crossfade)` SUPPRESSION mechanism. When the parent already has
`opacityExit` set, the child's own crossfade is skipped. The
codex fix (per-frame layoutIds + opacity pin) was actually
correct; the inner crossfade was already suppressed by the path
check.

The revert brought back a worse symptom (text "pop-in" at 0.7
progress on close because without layoutId on inner spans, motion
treated them as fresh-mounting elements on close and ran the
default entrance-fade-in).

User pushed back: "you introduced a bug that had already been fixed
by chatgpt." Restored in B.PT187.

**Lesson**: when motion's source code has a multi-clause boolean
controlling a behavior, read all clauses before jumping to a
conclusion about which path is firing. The path check that suppresses
the inner crossfade is the actual reason the codex fix worked.

### Round 3 — B.PT188: SwitchLayoutGroupContext.Provider

Source-verified that motion has `preserveOpacity` flag on projection
nodes. The flag is set via `SwitchLayoutGroupContext` from
framer-motion. Wrapped the layoutId tree.

It worked partially but didn't fix everything. Marked "Internal,
exported only for usage in Framer" in the d.ts — risky API.

**Lesson**: framer-motion-internal APIs are real but pose risk.
Look for the public typed equivalent first.

### Round 4 — B.PT189: layoutCrossfade={false}

Discovery via `motion-dom/dist/index.d.ts:970`:

> "By default, shared layout elements will crossfade. By setting this
>  to `false`, this element will take its default opacity throughout
>  the animation."

This is the public, typed escape that B.PT188's framer-motion-internal
context was approximating. Replaced the Provider with the documented
prop. The fade glitch was fixed, motion's `prevLead.hide()` (visibility:
hidden) cascaded to phantom subtree.

**Lesson**: motion-dom's d.ts has documented props that motion.dev
public docs don't surface. **Always grep the d.ts file for the
behavior you want before falling back to internal APIs**.

### Round 5–6 — B.PT190 / B.PT191: layoutAnchor experiments

User reported the duration label "snaps" — separate from the close
fade glitch. Tried `layoutAnchor={x:1, y:0}` (right-edge anchor).
Made it worse: motion's `calcRelativeAxisPosition` saw the relative-
from-right was constant in both contexts (since duration is right-
aligned in landing AND modal), so motion didn't interpolate, so the
duration snapped harder. Reverted to `{x:0, y:0}`. Still snapped,
but for a different reason (the actual cause we eventually found).

**Lesson**: `layoutAnchor` "prevents drift" — that means it
SUPPRESSES the animation when the relative-to-anchor position is
constant. If both source and dest have the child at the same anchor
point, motion will NOT interpolate. That's the opposite of what we
wanted for duration.

### Round 7 — B.PT192: debug background colors

Added contrast-color backgrounds (lime / cyan / pink) on Frame 9 /
text / duration so we could SEE the layout boundaries during the
morph. This was the first iteration that started giving us real
visual data.

**Lesson**: instrumented debug visibility (colored backgrounds, dotted
outlines) on a problem element costs ~5 minutes and saves dozens of
minutes of guessing what the rendered rect actually is. Should have
been step 1, not step 7.

### Round 8 — Build a per-frame tracer (handoff/trace-frame9-rect.js)

Browser-console snippet that records `getBoundingClientRect`,
`style.transform`, and `getComputedStyle.transform` per
`requestAnimationFrame` for ~5 s. Result lives on `window.__trace`
for `console.table`-friendly inspection.

First run captured close direction. Second run for OPEN missed the
phantom subtree because the script captured selectors before phantom
mounted. Updated the tracer to re-query selectors per frame.

**Lesson**: motion's projection state mutates rapidly — guessing
about it from source code is brittle. A 100-line tracer that records
actual DOM state per frame removes all the guessing. Build the
tracer **once** as a reusable handoff script before debugging anything
animation-heavy.

### Round 9 — Capture both layoutId pairs simultaneously

Realized landing and phantom are a shared-layout pair. The "snap" the
user observed was on whichever side was visible. With
`layoutCrossfade={false}` from B.PT189, one side is `visibility:
hidden` at any given time. We were tracing the visible side but
missing the projection state of the hidden side, which is
where motion does its FLIP math.

Built `handoff/trace-both-sides.js` that captures both subtrees
and labels which is visible.

**Lesson**: when an animation is shared-layout (two elements with
the same `layoutId`), instrument BOTH SIDES of the pair. The visible
side might be derived from the projection state of the hidden side.

### Round 10 — B.PT193: the actual fix

Trace caught it precisely:

```
t=0    pd_x=801 (landing-natural via FLIP)
t=8    pd_x=778 (motion's first projection tick — moved LEFT 23px)
t=33   pd_x=768 (continues LEFT, bottom)
t=50   pd_x=771 (reverses RIGHT)
t=117  pd_x=864 (RIGHT, tracking expansion)
```

Non-monotonic dip from 801 → 768 → 864. The "snap" the user
described.

Per the trace + user's hypothesis ("it should grow naturally
linearly"), the per-element layout animation on duration is what
produces the dip. `layoutAnchor={false}` disables that animation;
duration inherits Frame 9's transform directly.

The fix was 5 lines of code. Took 10 commits and 6 reverts to find.

## What could've been done better

1. **Built the tracer in iteration 1, not iteration 8.** A
   per-frame `getBoundingClientRect + style.transform` tracer takes
   100 lines of vanilla JS. It removes ALL the guessing and lets you
   reason from data instead of from spec interpretation. Should be
   the first tool out for any visual animation bug.

2. **Read the package's d.ts files before reaching for "internal"
   APIs.** `motion-dom/dist/index.d.ts` had `layoutCrossfade?:
   boolean` and `layoutAnchor?: {x,y} | false` documented with
   docstrings. The motion.dev tutorials don't mention them. The
   `framer-motion/dist/types/index.d.ts` had `SwitchLayoutGroup
   Context` marked "Internal." We tried the internal API first and
   shipped it (B.PT188) before discovering the public typed prop
   (B.PT189). Grep the d.ts files for the behavior you want
   FIRST, before exploring source.

3. **Trust the user's empirical observations more, especially when
   they describe a fix that worked previously.** B.PT186 reverted a
   working fix (codex's per-frame layoutId + opacity pin). The user
   said "another agent fixed this for me, your revert broke it."
   The right response was to dig into WHY codex's fix worked
   (motion's path-suppression check) before reverting. Reverting on
   a partial source-code reading wasted three iterations.

4. **Add color-coded debug backgrounds to motion-tracked elements
   FIRST.** B.PT192 (lime / cyan / pink backgrounds) took 5 minutes
   and immediately revealed the layout boundaries. Should be a
   reflex when debugging any motion morph — even before reaching
   for the tracer.

5. **Capture both sides of shared-layout pairs in instrumentation.**
   Half the data is hidden (literally, via `visibility:hidden`).

6. **Don't rule out user hypotheses just because they sound
   informal.** "We should let it grow or shrink naturally instead
   of doing so with an animation" was a precise statement that
   directly mapped to `layoutAnchor: false`. The user's mental
   model of Figma's auto-layout fill-container was actually how
   motion's `layoutAnchor: false` works.

## Useful artifacts produced (keep)

- `handoff/trace-chip-opacity.js` — opacity-only tracer
- `handoff/trace-frame9-rect.js` — Frame 9 size + transform tracer
- `handoff/trace-both-sides.js` — dual-side simultaneous tracer with
  click-aligned start (`__autoTraceClick(selector)`) so capture
  begins AT the click, not before.

These are paste-ready in DevTools. Reusable for any future motion
shared-layout debug.

## TL;DR for next time

When the user reports "this animation looks wrong":

1. Add color backgrounds to suspected elements (5 min).
2. Paste the `handoff/trace-both-sides.js` tracer (1 min).
3. Capture the actual frame-by-frame rect/transform data (1 click).
4. Read the data BEFORE reaching for source-code interpretation.
5. If source-code reading is needed, grep `node_modules/<lib>/dist/
   *.d.ts` for the behavior you want before exploring runtime
   source. The d.ts files are the spec.
6. If you find a fix in commit history (e.g., a co-authored Codex
   commit), STUDY it — don't revert without understanding why it
   worked.
