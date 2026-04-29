# Repo wrapper scope (directory name is historical)

> The aesthetic identity has shifted away from the original brutalist palette. Wrappers in this directory are the **canonical chrome for the dashboard surface** — using them is how new pages match `/bookings` + `/settings` + `/workspaces/*`. The directory name + component names will be renamed in a planned refactor; until then, keep using them as-is. See `AGENTS.md` *Visual identity* for the full directive.

- Wrap existing shadcn primitives with `cn("<repo overrides>", className)` instead of re-implementing them.
- Keep wrappers thin and keep the underlying primitive API recognizable.
- Reuse the repo palette, typography, border treatment, and motion language from `src/app/globals.css`.
- Build mobile-first and prefer container-query-aware layouts.
- If a wrapper needs a new primitive capability, update the primitive deliberately instead of duplicating it here.

## Tokens at a glance

- Radius: `--bru-r-xs` (2px), `--bru-r-sm` (6px). No `--bru-r-md` — it was dropped during the radius collapse.
- Fonts: `--font-grotesk` (Space Grotesk, body + headings), `--bru-mono` / `--font-jetbrains` (JetBrains Mono, labels + accents). No serif.
- Title pattern: see `bru-v1-name` in globals.css — Space Grotesk weight 900, `clamp()` size, tight letter-spacing. Reserved for the **public visitor surface only** (`/h/[handle]`, `/booked/[uid]`); dashboard pages don't lead with this hero treatment.
- Empty state: use `BrutalistEmpty` (this dir) for primary-surface empties; the inline dashed `<p>` pattern for sub-section empties.
- Full rules: `.claude/rules/brutalist-ui.md` (file name historical, rules apply to the current chrome).
