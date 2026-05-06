# Motion shared-layout (Figma Smart-Animate) conventions

This project uses framer-motion (via `motion/react`) shared-layout
animations to mirror Figma Smart-Animate behavior on the visitor
surface (`/h/[handle]/components/host-profile.tsx` ↔
`handle-modal.tsx` chip morph). The conventions below were
hard-earned through B.PT170-B.PT193; follow them when extending
the morph or shipping new shared-layout features.

## Default props for new shared-layout pairs

When you introduce two motion elements that share a `layoutId`
across a mount/unmount boundary (modal / sheet / tab indicator
that reparents):

- **Set `layoutCrossfade={false}` on at least one side.** Motion's
  default opacity crossfade overrides explicit `animate.opacity`
  values via `mixValues`. With `layoutCrossfade={false}`, the
  prev lead is hidden via `visibility: hidden` on promote — clean
  single-element-morph appearance, cascades to descendants. The
  prop is documented in `motion-dom/dist/index.d.ts` (`MotionNode
  Options.layoutCrossfade`) but is NOT in motion.dev docs.

- **Forward the `transition` prop through every nested
  motion.span / motion.div with `layout` / `layoutId`.** Without
  it they fall to `defaultLayoutTransition = { duration: 0.45,
  ease }` and ignore parent overrides. Symptom: outer chip
  respects user's slow-mo override but inner spans don't —
  visible as a snap relative to the slowed outer.

- **For shared-layout descendants whose CSS-position-relative-to-
  parent is the same in BOTH source and dest contexts** (e.g. a
  right-aligned label in a flexbox `justify-between` container),
  set `layoutAnchor={false}`. Motion's default
  `layoutAnchor={x:0, y:0}` makes it run a per-element relative-
  projection animation; combined with the parent's FLIP transform
  this can produce non-monotonic position dips. `false` disables
  the per-element animation; the child inherits the parent's
  transform via CSS.

  **Caveat**: `layoutAnchor={false}` also disables inverse-scale
  correction, so child content scales with parent's transform
  during the morph. Acceptable when the parent's scale change is
  small or when the child is text-only and the brief mid-flight
  scaling is imperceptible.

- **Set `initial={{ opacity: <same as animate> }}`** on
  layoutId-bearing elements. Without it, motion runs its
  entrance fade-in (0 → 1) on first mount — visible as the
  "clone fades in beside the source" glitch.

## Choosing stretch vs no-stretch internals

Motion layout animations use `transform: scale()` under the hood.
That means plain descendants visually scale with the parent. Treat
this as an explicit design choice when porting Figma Smart Animate:

- **To let internals stretch with the container**, keep the child as
  normal DOM or only put `layoutId` on the outer shared element. This
  matches Figma layers whose content should scale with the resized
  frame.

- **To let a child container resize while preserving its own child
  paint**, put `layout` on that direct child and forward the same
  `transition`. In the `/h/[handle]` chip morph, Frame 9 uses this:
  it widens from the landing chip to the modal chip while Motion
  counter-scales its contents.

- **To move text/images without visual stretch**, put
  `layout="position"` on the text/image wrapper, forward the same
  `transition`, and pin `initial` / `animate` / `exit` opacity to
  `1`. Use stable child `layoutId`s on both source and destination
  when the child exists in both states; otherwise Motion treats the
  destination as a new node and may fade or duplicate it.

- **To hide the stale source when inspect mode keeps Layer 1 mounted**,
  strip the source `layoutId` only after measurement and set
  `visibility: hidden` on the stripped Layer 1 child row. This keeps
  Motion's source rect cache while preventing the old title/text from
  fading in place beside the promoted clone.

Current canonical examples:

- `SlotRow` Frame 9: child container resizes with `layout`; inner
  text/time wrappers use `layout="position"` to avoid text stretching.
- `oh-identity-row` / `oh-identity-title`: stable child `layoutId`s +
  pinned opacity prevent the title from becoming two visible copies
  during the Layer 1 → Layer 2 handoff.

## Reference example (canonical SlotRow setup)

`src/app/h/[handle]/components/host-profile.tsx` `SlotRow`:

```tsx
<motion.span
  layoutId={frame9LayoutId}
  layout
  transition={transition}            // forwarded
  initial={{ opacity: 1 }}            // matches animate
  animate={{ opacity: 1 }}
  exit={{ opacity: 1 }}
>
  <motion.span
    layoutId={textLayoutId}
    layout="position"
    transition={transition}            // forwarded
    layoutAnchor={{ x: 0, y: 0 }}      // text at left edge
    initial={{ opacity: 1 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 1 }}
  >…</motion.span>
  <motion.span
    layoutId={durationLayoutId}
    layout="position"
    transition={transition}            // forwarded
    layoutAnchor={false}               // duration at right edge,
                                       // disable per-element animation
    initial={{ opacity: 1 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 1 }}
  >…</motion.span>
</motion.span>
```

Outer chip + outer modal article (B.PT189):

```tsx
<motion.article
  layoutId="handle-card"
  layoutCrossfade={false}              // disables auto crossfade
  transition={{ type: "spring", ...openSpring }}
  ...
>…</motion.article>
```

## When debugging a shared-layout bug

1. **Add color-coded debug backgrounds** on the suspect motion
   elements so you can SEE the layout boundaries. Frame 9 = lime,
   text = cyan, duration = pink is the established palette
   (B.PT192). 5 minutes of work, saves hours of guessing.

2. **Paste a per-frame tracer** before the source-code dive. The
   `handoff/trace-*.js` scripts are paste-ready in DevTools:
   - `handoff/trace-both-sides.js` — captures landing AND phantom
     subtrees per frame, with `__autoTraceClick(selector)` for
     click-aligned start.

3. **Read `node_modules/motion-dom/dist/index.d.ts`** for the
   prop you want before reaching into `motion.dev.js` source or
   reaching for `framer-motion`-internal APIs marked "Internal,
   exported only for usage in Framer." motion-dom's d.ts has
   docstring for `layoutAnchor`, `layoutCrossfade`,
   `layoutScroll`, `layoutRoot`, `layoutDependency`. They're
   public.

4. **Trust user empirical observations**, especially when they
   describe a fix that worked previously or a Figma behavior
   they want to replicate. Their mental model is often a precise
   match to a motion API you haven't surfaced yet.

## Postmortem reference

`handoff/postmortem-duration-snap.md` — full debug journey for
the chip-morph duration snap, including the wrong turns. Read
before debugging any shared-layout artifact.

## Hard rules (never)

- **Never use `as any`** on motion props. If TypeScript objects
  to a prop, check `motion-dom/dist/index.d.ts` for the typed
  surface. The prop almost certainly exists, just not in
  `framer-motion`'s `MotionProps` re-export. Module augmentation
  is preferred over `as any` if the prop is missing in some
  variant of motion's d.ts.

- **Never reach for `SwitchLayoutGroupContext` /
  `useInstantLayoutTransition` / other framer-motion-internal
  APIs** before exhausting the public typed props. Internals
  break across motion 12.x → 13.x. Public typed props are stable
  and don't carry the "Internal" disclaimer.

- **Never revert a fix that the user explicitly attributes to a
  prior agent / Codex / ChatGPT session** without first
  understanding WHY their fix worked. The user has more context
  than you do; reverts cost real iterations.
