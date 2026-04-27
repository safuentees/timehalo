---
paths:
  - "src/app/**/*.tsx"
  - "src/components/ui/**/*.tsx"
  - "src/components/brutalist/**/*.tsx"
---

# Brutalist UI

## Composition

- Compose existing shadcn primitives and repo wrappers before inventing new structure.
- Keep brutalist-specific overrides in `src/components/brutalist/` and keep wrappers thin.
- Build mobile-first and avoid horizontal scroll at narrow widths.
- Prefer container queries for brutalist layouts that live inside the host shell.
- In InputGroup layouts, keep the input before the addon in DOM order.
- For complex forms, keep the canonical `FieldGroup` and `FieldSet` structure intact.
- For new authenticated pages: wrap content in `BrutalistPageShell` (owns `max-w-[760px] px-4 py-8 sm:px-6 sm:py-10`) and lead with `BrutalistPageHeader title="..."`. Both in `src/components/brutalist/`. Drift is a bug — `(host)/AGENTS.md` flags this as a forcing function.

## Visual language

- Paper-and-ink palette, thick obvious borders (`2.5px solid var(--bru-ink)`), uppercase mono accents for labels/metadata.
- Do not ship stock shadcn visuals — if a surface could land in a generic shadcn starter unchanged, it isn't finished.

## Radius scale (one structural token)

- Structural surfaces (cards, inputs, sheets, dialogs, tabs, sidebar items, buttons): `rounded-sm` (6px). This is the ONLY structural radius.
- Pills/avatars/circles/dots/switches/sliders: `rounded-full`.
- Intentional sharp where it reads as a deliberate edge: `rounded-none`.
- Do NOT introduce `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`. The tokens were dropped via `--radius-*: initial` in `@theme` (`src/app/globals.css`) — Tailwind generates no CSS for those classes and corners silently render at 0px.
- In raw CSS, use `var(--bru-r-xs)` (2px, micro-rounding for chips/segments) or `var(--bru-r-sm)` (6px). `--bru-r-md` no longer exists.

## Typography (single family + mono accent)

- Headings + body: Space Grotesk via `--font-grotesk`. Tailwind exposes it as both `font-sans` and `font-heading` — they're the same family. `font-heading` is a semantic alias kept so shadcn titles (Card/Dialog/Sheet/Drawer/Empty) read naturally.
- Metadata/labels/uppercase chrome/tabular numbers: JetBrains Mono via `--font-jetbrains`, also reachable as `font-mono` or `var(--bru-mono)` in raw CSS.
- No serif. Instrument Serif was removed. If a title needs more weight, use `font-bold` or `font-black` and bigger size — not a different family. Reference: the `/h/[handle]` hero (`bru-v1-name` in globals.css) — Space Grotesk weight 900, `clamp(40px, 12cqi, 64px)`, letter-spacing `-0.04em`, line-height `0.92`.

## Empty states + icons

- Two patterns, picked by surface size:
  - **Sub-section empties** (a section inside a settings page or tab — e.g. "no workflows yet"): one-line muted text in a tight dashed border. Pattern: `<p className="text-[13px] opacity-55 border-[1.5px] border-dashed border-bru-line p-4 rounded-(--bru-r-xs)">{message}</p>`. Combine title + description into a single sentence rather than splitting them — splitting reads as a card.
  - **Primary-surface empties** (a whole page or main route — e.g. `/bookings` with no bookings): use `BrutalistEmpty` from `src/components/brutalist/brutalist-empty.tsx`. Renders icon (optional) + bold Space Grotesk title + 13px muted description in a `border-2 border-dashed border-bru-line-strong p-10` frame.
- Icon convention (whenever an icon sits inside a placeholder/empty state):
  - Bare lucide line icon — never a muted-grey rounded background tile (that's stock shadcn).
  - Size: `size-8` (32px) for empties, `size-4` (16px) inline with text.
  - `strokeWidth={1.5}` — slimmer than lucide's default 2 reads more precise/brutalist.
  - Color: `text-[color:var(--bru-content-subtle)]` (35% ink) for empty-state icons, `text-[color:var(--bru-content-muted)]` (55%) for inline accents. Never `text-muted-foreground` (shadcn default — wrong vocabulary).
  - No fill, no halo, no ring, no rotation effects — the icon sits in flow.

## Copy

- No mid-dot separators (`·`) in copy. They read as filler — drop the separator AND audit each half against "does this carry data the user can't read elsewhere on this screen." Memory entry: `feedback_no_dot_separator.md`.
