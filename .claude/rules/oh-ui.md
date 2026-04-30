---
paths:
  - "src/app/**/*.tsx"
  - "src/components/ui/**/*.tsx"
  - "src/components/oh/**/*.tsx"
---

# Project UI rules (file name is historical)

> The visual aesthetic walked away from the original brutalist palette. **New dashboard pages match the chrome of the most-recently-shipped pages** (`/bookings`, `/settings`, `/workspaces/*`) — see `AGENTS.md` *Visual identity* for the full directive. The component + utility names below (`OhPageShell`, `oh-*` classes, `--oh-*` tokens) stay — they're real artifacts a planned refactor will rename. The engineering rules below (radius scale, typography utilities, list patterns, empty states, destructive-action patterns, copy rules) are good discipline regardless of aesthetic.
>
> The strong **paper-and-ink + thick borders + mono caps** look is now scoped to the **public visitor surface only** (`/h/[handle]`, `/booked/[uid]`) — don't extend it to new dashboard pages.

## Composition

- Compose existing shadcn primitives and repo wrappers before inventing new structure.
- Keep repo-specific overrides in `src/components/oh/` and keep wrappers thin. (Directory name is historical; the wrappers themselves are the canonical chrome for the dashboard surface.)
- Build mobile-first and avoid horizontal scroll at narrow widths.
- Prefer container queries for layouts that live inside the host shell.
- In InputGroup layouts, keep the input before the addon in DOM order.
- For complex forms, keep the canonical `FieldGroup` and `FieldSet` structure intact.
- For new authenticated pages: wrap content in `OhPageShell` (owns `max-w-[760px] px-4 py-8 sm:px-6 sm:py-10`) and lead with `OhPageHeader title="..."`. Both in `src/components/oh/`. These wrappers ARE what shipped on `/bookings` + `/settings` — using them is the way to match the new chrome, not a forced brutalist override.

## Visual language (split by surface)

- **Dashboard surface** (`/(host)/*`) — quieter chrome, hairline borders (1.5px structural), Space Grotesk for body + headings, JetBrains Mono reserved for metadata + labels (eyebrows, mono numbers, monospace technical strings). Match `/bookings` row density, `/settings` section rhythm, `/workspaces` card stack — those are the canonical references.
- **Public visitor surface** (`/h/[handle]`, `/booked/[uid]`) — keeps the stronger paper-and-ink palette, thicker borders (2.5px), uppercase display type. The visitor's first/last touch stays bold by design. Don't drag these motifs into dashboard pages.
- Do not ship stock shadcn visuals on either surface — if a surface could land in a generic shadcn starter unchanged, it isn't finished.

## Radius scale (one structural token)

- Structural surfaces (cards, inputs, sheets, dialogs, tabs, sidebar items, buttons): `rounded-sm` (6px). This is the ONLY structural radius.
- Pills/avatars/circles/dots/switches/sliders: `rounded-full`.
- Intentional sharp where it reads as a deliberate edge: `rounded-none`.
- Do NOT introduce `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`. The tokens were dropped via `--radius-*: initial` in `@theme` (`src/app/globals.css`) — Tailwind generates no CSS for those classes and corners silently render at 0px.
- In raw CSS, use `var(--oh-r-xs)` (2px, micro-rounding for chips/segments) or `var(--oh-r-sm)` (6px). `--oh-r-md` no longer exists.

## Typography (single family + mono accent)

- Headings + body: Space Grotesk via `--font-grotesk`. Tailwind exposes it as both `font-sans` and `font-heading` — they're the same family. `font-heading` is a semantic alias kept so shadcn titles (Card/Dialog/Sheet/Drawer/Empty) read naturally.
- Metadata/labels/uppercase chrome/tabular numbers: JetBrains Mono via `--font-jetbrains`, also reachable as `font-mono` or `var(--oh-mono)` in raw CSS.
- No serif. Instrument Serif was removed. If a title needs more weight, use `font-bold` or `font-black` and bigger size — not a different family. Reference: the `/h/[handle]` hero (`oh-v1-name` in globals.css) — Space Grotesk weight 900, `clamp(40px, 12cqi, 64px)`, letter-spacing `-0.04em`, line-height `0.92`.

### Typography utilities — single source of truth for chrome roles

Three semantic CSS classes live in `src/app/globals.css`. Use them; do not inline the equivalent eight-class strings.

- `oh-legend` — section / field label. Mono 11px, font-weight 800, letter-spacing 2.5px, uppercase, opacity 55. Replaces every verbatim `font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55`.
- `oh-description` — section / field description. 13px, line-height 1.5, max-width 65ch, opacity 65. Replaces `text-[13px] leading-[1.5] opacity-65 max-w-prose`.
- `oh-eyebrow` — small mono caps metadata badge. Mono 10px, font-weight 800, letter-spacing 2px, uppercase, opacity 55. Replaces `font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55`.

If a callsite needs to override one token (e.g. `tabular-nums` on a date eyebrow, `opacity-100` for an active state, a different size at sm+), compose: `className="oh-eyebrow tabular-nums opacity-100"`. Never re-inline the base.

## List patterns

Three list shapes, picked by the shape of the row + the visual weight you want:

- **Card-stack** — `<ul role="list" className="flex flex-col gap-2.5">` with `<li>` wrapping an `<article className="rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-4 transition-colors duration-150 ease-bru hover:border-oh-line-strong">`. Use for variable-height items with mixed content + per-row inline affordances (status badge, edit button, etc.). The bordered card frames each item as its own thing. References: `workflow-fields.tsx`, `api-keys-fields.tsx`, `calendar-fields.tsx`.
- **Divided list (structural)** — `<ul className="border-2 border-oh-line divide-y-2 divide-oh-line">` with `<li>` rows that don't carry their own border. Heavy 2px frame + 2px dividers. Use for compact uniform rows in dialog-scale surfaces (single label + control, e.g. a calendar-name + Switch row). Reference: `calendar-pick-dialog.tsx`.
- **Divided list (content)** — `<ul className="border-y border-oh-line divide-y divide-oh-line">` with `<li>` rows that don't carry their own border. Hairline (1px) frame + 1px dividers. Use for content-feed surfaces where the row is a navigable item (whole row is a `<Link>`). Click cue is `hover:bg-oh-tint-hover` on the row, no per-row border. Reads as a continuous feed instead of a stack of cards. Reference: `bookings-list.tsx` (cal.com `BookingListItem` pattern — `hover:bg-cal-muted`, no per-row border, hairlines between).

When in doubt, use card-stack — it scales better as items gain affordances. Switch to a divided list when the row is uniform-shape AND the dominant interaction is "tap to drill in" rather than "scan + use the per-row controls." Pick the structural variant for tight switch-rows in dialogs; pick the content variant for navigable feeds on dashboard pages.

## Empty states + icons

- Two patterns, picked by surface size:
  - **Sub-section empties** (a section inside a settings page or tab — e.g. "no workflows yet"): use `<OhInlineEmpty>` from `src/components/oh/inline-empty.tsx`. One-line muted text in a tight dashed border. Combine title + description into a single sentence rather than splitting them — splitting reads as a card.
  - **Primary-surface empties** (a whole page or main route — e.g. `/bookings` with no bookings): use `OhEmpty` from `src/components/oh/oh-empty.tsx`. Renders icon (optional) + bold Space Grotesk title + 13px muted description in a `border-2 border-dashed border-oh-line-strong p-10` frame.
- Icon convention (whenever an icon sits inside a placeholder/empty state):
  - Bare lucide line icon — never a muted-grey rounded background tile (that's stock shadcn).
  - Size: `size-8` (32px) for empties, `size-4` (16px) inline with text.
  - `strokeWidth={1.5}` — slimmer than lucide's default 2; matches the chrome's existing icon weight.
  - Color: `text-[color:var(--oh-content-subtle)]` (35% ink) for empty-state icons, `text-[color:var(--oh-content-muted)]` (55%) for inline accents. Never `text-muted-foreground` (shadcn default — wrong vocabulary).
  - No fill, no halo, no ring, no rotation effects — the icon sits in flow.

## Destructive actions

Three patterns, picked by reversibility:

- **Single-click destructive (mid-stakes, recoverable)**: never. Always pair with a confirm. Use `<ConfirmDialog>` from `src/components/oh/confirm-dialog.tsx`. Reference: `workflow-fields.tsx` (delete) + `api-keys-fields.tsx` (revoke).
- **Typed-confirm (irreversible / account-level)**: render the typed-email or typed-handle confirmation pattern. Reference: `delete-account-dialog.tsx`.
- **Native `window.confirm`**: never. Breaks the in-app chrome (looks like an OS modal injected at random) and is mobile-hostile. Audit on 2026-04-27 ripped the last one out.

The `<ConfirmDialog>` API takes `trigger` (the button), `title`, `description`, `confirmLabel`, `cancelLabel`, `pending` (from a mutation hook), and `onConfirm` (awaited; close-on-resolve). Don't roll a one-off dialog for every destructive action.

## Copy

- No mid-dot separators (`·`) in copy. They read as filler — drop the separator AND audit each half against "does this carry data the user can't read elsewhere on this screen." Memory entry: `feedback_no_dot_separator.md`.
- No hardcoded English strings in production code paths. Every visible string runs through `useTranslations()` from next-intl. Dates use ICU date format (`{date, date, medium}`) so locale-aware month/day order is correct — never hand-roll a `MONTH_SHORT` array.
