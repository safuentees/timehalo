# Officehours CSS variable reference

Always-loaded cheatsheet so the F3-class trap from B.PT131 doesn't
recur — `var(--oh-bg)` is **not** defined as a CSS custom property
and falls through to transparent.

## CSS custom properties on `:root`

Defined in `src/app/globals.css`. These ARE accessible via
`var(--name)`:

```
--oh-paper        #eee7d5            line 132 — page paper / inner panel
--oh-ink          #0a0a0a            line ~133 — text default + line-strong
--oh-frame        ~#d3ccbd           line 244 — outer/chrome (color-mix
                                     in srgb, --oh-ink 12%, --oh-paper)
--oh-content-muted    rgba(10,10,10,0.55)   55% ink — body metadata
--oh-content-subtle   rgba(10,10,10,0.35)   35% ink — subtle accents
--oh-line-default     rgba(10,10,10,0.22)   22% ink — hairlines
--oh-line-strong      #0a0a0a               100% ink — hard edges
--oh-line-placeholder rgba(10,10,10,0.12)   12% ink — empty states
--oh-tint             rgba(10,10,10,0.06)   6% ink — hover/active bg
--oh-tint-hover       same as --oh-tint     alias
--oh-tint-active      same as --oh-tint     alias
--oh-r-xs             2px                   chips, segments
--oh-r-sm             6px                   structural radius
--oh-r-window         18px                  inner-window radius
```

Dark mode flips `--oh-paper` and `--oh-ink` (paper becomes `#0a0a0a`,
ink becomes `#ede4cf`); the `color-mix()` derivatives (`--oh-frame`,
content-muted, etc.) recompute automatically since they reference
the variables.

## Tailwind `@theme inline` tokens (utility class form)

`globals.css:17` opens `@theme inline { ... }` which generates the
`bg-*` / `text-*` / `border-*` Tailwind utility families AND emits
the underlying `--color-oh-*` custom properties on `:root`.

**These ARE Tailwind utilities (preferred when available):**

```
bg-oh-bg            → var(--oh-paper)        canonical paper bg
bg-oh-bg-muted      → var(--oh-twdivider-bg) tw-divider bg
bg-oh-content       → var(--oh-ink)
bg-oh-tint          → var(--oh-tint)
text-oh-content     → var(--oh-ink)
text-oh-content-muted → 55% ink
text-oh-content-subtle → 35% ink
border-oh-line      → 1px hairline (default)
border-oh-line-strong → 1px ink
```

## Pitfalls (the F3 trap)

`@theme inline` only emits the **`--color-oh-*`** form on `:root`,
NOT the bare `--oh-*` form:

| You write | What CSS sees |
|---|---|
| `bg-oh-bg` | resolves via `--color-oh-bg` → paper ✓ |
| `bg-[color:var(--oh-paper)]` | `--oh-paper` IS on `:root` → paper ✓ |
| `bg-[color:var(--oh-frame)]` | `--oh-frame` IS on `:root` → Sisal ✓ |
| `bg-[color:var(--oh-bg)]` | `--oh-bg` is **NOT** on `:root` → transparent ✗ |

**Rule.** When using arbitrary `bg-[color:var(--name)]` or
`text-[color:var(--name)]`:
- Verify `--name` is on `:root` in `globals.css` first.
- For paper bg, prefer the shorthand `bg-oh-bg`.
- For Sisal bg, no shorthand exists — use
  `bg-[color:var(--oh-frame)]`.
- For ink, paper, frame: the explicit `var(--oh-paper)` / `--oh-ink` /
  `--oh-frame` forms are always safe.

## Symmetric tokens reference

The canonical Figtail-friendly token list lives in
`docs/figma/oh-tokens.css` for export to Figma. When changing tokens
in code, edit that file in the same commit so the Figma sync stays
current.
