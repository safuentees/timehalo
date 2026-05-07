# Scroll containers and the `flex-1` height chain

The B.PT241→B.PT249 trail spent eight rounds chasing the wrong
culprit (phantom-layer pointer-events, FocusOn `noIsolation`,
`scrollLock=false`, belt-and-suspenders pointer-events caps).
The actual bug was a broken flex height chain. This rule exists
so the same diagnostic loop doesn't repeat.

## The rule

Any component that contains a Radix `ScrollArea` (or any
`overflow:auto` / `overflow:scroll` element relying on
`flex-1` + `min-h-0` for its height) MUST be mounted inside a
**flex column with a definite height ancestor**. The wrapper
that holds the scroll component is itself a flex item AND must
be a flex container.

Concretely, the wrapper around `<MonthCalendar>` (or any equivalent
scroll-host component) must include both:

```
flex flex-col          ← so its child's `flex-1` resolves
min-h-0 flex-1         ← so it itself takes a real height as
                          a flex item of its own parent
```

Drop either half and the chain collapses silently.

## Why it breaks silently

- `flex-1` (== `flex: 1 1 0%`) only takes effect when the
  parent is a flex container. With a block parent, it is
  layout-noise.
- A flex container with `height: auto` resolves its height from
  its children. If every child has `flex-basis: 0%` + `min-h: 0`,
  every child collapses to 0 and the parent collapses too.
- Radix `ScrollArea` Viewport uses `size-full` (`100% × 100%`).
  Against a parent of size 0, the Viewport is also 0 — but
  there's no overflow either, so `ScrollArea` reports the
  content fits and disables wheel/touch capture.
- The wheel event lands on the right element. There is nothing
  to scroll. Hence: "scroll doesn't work" with no error,
  no console message, no missing event handler.

## Diagnostic shortcut

Before chasing event-capture, FocusOn, react-remove-scroll,
phantom layers, or pointer-events: **walk the height chain from
the viewport down to the scroll container**. At every level,
confirm that `flex-1` has a flex parent. The fastest way: open
DevTools, click the `ScrollArea` Viewport, walk up the
parents in the Layout panel, and check `display: flex` +
`flex-direction: column` is set on every step that has `flex-1`
descendants.

If `/t` (or any isolated demo) scrolls but the embedded usage
doesn't, the difference is almost always a missing
`flex flex-col` somewhere up the chain — not a wheel-event
interceptor.

## Canonical references

- Working: `src/app/t/page.tsx` — wraps `<MonthCalendar>` in
  `flex h-[500px] flex-col`.
- Working: `src/app/h/[handle]/components/handle-modal.tsx`
  `renderMonthBody()` — wraps `<MonthCalendar>` in
  `flex min-h-0 flex-1 flex-col` (post-B.PT249).
- The `<MonthCalendar>` source itself
  (`src/components/calendar/month-calendar.tsx`) sets
  `flex min-h-0 flex-1 flex-col` on its outer container and
  `min-h-0 flex-1` on the `<ScrollArea>` Root — both halves of
  the chain on the inside. Parents must hold up the outside.

## When you change a scroll-host wrapper

If you edit a wrapper that mounts a `ScrollArea` (or any
`overflow:auto` host), test scrolling AT the embedding site
before merging. Do not assume "/t still works" implies the
real callsite works. The scroll component is healthy in
isolation; what changes between sites is the height chain.
