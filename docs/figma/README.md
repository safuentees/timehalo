# Figma workflow

Setup for porting the Officehours dashboard into Figma so animations can
be designed there and the spec round-tripped back into code.

## Files

- **`oh-tokens.css`** — flat list of every `--oh-*` token + Tailwind
  theme var, with `color-mix()` expressions resolved to literal
  rgba/hex. Feed this to the Figtail plugin to populate Figma Variables.

## One-time setup (~4 hours)

### Phase 1 — Variables (~15 min)

1. In Figma: install **Figtail** plugin
   ([Community link](https://www.figma.com/community/plugin/1605825399470035343)).
2. Run plugin → **Import CSS file** → upload `oh-tokens.css`.
3. Figtail creates a Variables collection named `oh` with ~30 typed
   variables (colors, font sizes, radii, focus shadows).
4. Manually add the ~8 motion tokens (`--ease-oh`, `--oh-t-*`) as
   `STRING` Variables — Figma has no native cubic-bezier type, so they
   live as documentation strings. ~5 min.

### Phase 2 — Port routes (~2-3 hrs)

1. Subscribe to **html.to.design PRO** ($12/mo annual) OR use the free
   tier (10 imports / 30 days, no signup).
2. `pnpm dev` locally; sign in once so authed routes render.
3. Run html.to.design plugin → enter URL → set widths to `400, 768, 1280`.
4. Routes worth porting:
   - `/bookings` — canonical authed page
   - `/availability` — single-form dashboard
   - `/profile`
   - `/settings/general`
   - `/h/[handle]` — visitor surface (use the seeded test user handle)
5. ~15 imports total (5 routes × 3 widths).
6. Plugin prompts for Space Grotesk + JetBrains Mono — one click each
   from Google Fonts.

### Phase 3 — Rebind tokens (~60-90 min)

html.to.design captures **computed CSS**, not your source classes.
Colors come in as inline hex literals (e.g. `#eee7d5`). Sweep each
imported frame and rebind:

- Fills + strokes → bind to the matching Figma Variable from the `oh`
  collection (created in Phase 1)
- Border-radius → bind to `--oh-r-sm` / `--oh-r-xs` / `--oh-r-window`
- Typography → create Figma Text Styles named `oh-legend`,
  `oh-description`, `oh-eyebrow`, `oh-h1`-`oh-h3`. Apply to imported
  text layers.

### Phase 4 — Components (~30 min)

After rebinding, promote repeating elements to Figma Components:

- `BookingRow` (the `/bookings` row pattern)
- `EventTypeRow`
- The dashboard chrome (bar + sidebar) — useful as a single Component
  for the chrome-morph animation specs

Variants inherit the rebound tokens automatically.

## Designing animations

1. Build two frames on the same artboard:
   `chrome-morph/normal` and `chrome-morph/preview`.
2. Layout the SAME components in both, with the destination geometry
   (bar height / sidebar width / panel size) reflecting the morph
   end-state.
3. Connect with an interaction:
   - Trigger: `On click` (the prototype toggle)
   - Action: `Smart Animate`
   - Easing: `Custom (cubic-bezier)` — set `x1, y1, x2, y2`
   - Duration: integer ms

4. Hit Play in Figma's prototype panel. The morph plays; tweak until
   it feels right.

## Sending the spec back to code

Paste this shape into chat:

```
Smart Animate: chrome-morph/normal → chrome-morph/preview
Duration: 280ms
Easing: CUSTOM_CUBIC_BEZIER { x1: 0.32, y1: 0.72, x2: 0, y2: 1 }
Properties: bar.height (40 → 0), sidebar.width (200 → 0), panel.area (1fr fills freed space)
```

I'll convert to Tailwind v4 + CSS transitions, GSAP timeline, or
Framer Motion props depending on the property mix. For springs, I need
`mass / stiffness / damping` — Figma's `BOUNCY` / `GENTLE` / `QUICK`
presets are opaque numerics; click **Custom** to read out the
parameters before sending.

## Maintenance

- Re-run Figtail on `oh-tokens.css` when tokens change in code.
- Don't try to keep imported Figma frames in lockstep with code — the
  port is one-directional and re-imports overwrite hand-edits. Treat
  Figma as a **design-iteration sandbox seeded from prod**, not a
  living spec.
- Re-import a route only when its chrome changes structurally; the
  10-min rebind ritual after each re-import is the maintenance cost.
