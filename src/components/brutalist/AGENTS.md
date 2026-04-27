# Brutalist Wrapper Scope

- Wrap existing shadcn primitives with `cn("<repo overrides>", className)` instead of re-implementing them.
- Keep wrappers thin and keep the underlying primitive API recognizable.
- Reuse the repo palette, typography, border treatment, and motion language from `src/app/globals.css`.
- Build mobile-first and prefer container-query-aware layouts.
- If a wrapper needs a new primitive capability, update the primitive deliberately instead of duplicating it here.

## Tokens at a glance

- Radius: `--bru-r-xs` (2px), `--bru-r-sm` (6px). No `--bru-r-md` — it was dropped during the radius collapse.
- Fonts: `--font-grotesk` (Space Grotesk, body + headings), `--bru-mono` / `--font-jetbrains` (JetBrains Mono, labels + accents). No serif.
- Title pattern: see `bru-v1-name` in globals.css — Space Grotesk weight 900, `clamp()` size, tight letter-spacing.
- Full rules: `.claude/rules/brutalist-ui.md`.
