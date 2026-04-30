# Brutalist Design Checklist

## Layout

- Start at narrow width first and avoid horizontal scroll.
- Prefer container queries when the page lives inside dashboard chrome.
- Reuse `src/components/brutalist/` wrappers before inventing new primitive structure.

## Borders + radius

- Borders: thick + obvious (`2.5px solid var(--bru-ink)`), not subtle hairlines.
- Radius scale: `rounded-sm` (6px) for structural surfaces, `rounded-full` for pills/avatars/circles, `rounded-none` for intentional sharp edges. Anything else (`rounded-md/lg/xl/2xl/3xl/4xl`) is forbidden — the tokens are dropped in `@theme`.
- In raw CSS, `var(--bru-r-xs)` (2px) for micro-rounding, `var(--bru-r-sm)` (6px) for surfaces.

## Typography

- Space Grotesk for headings + body (`--font-grotesk`, surfaced as `font-sans` and `font-heading`).
- JetBrains Mono for labels, metadata, uppercase chrome, tabular nums (`--font-jetbrains` / `var(--bru-mono)` / `font-mono`).
- No serif. If you need title weight, use `font-bold`/`font-black` and bigger size — not a different family. Reference: `bru-v1-name` in globals.css.

## Tone

- Use the repo palette and typography tokens from `src/app/globals.css`.
- Use uppercase or mono accents deliberately, not everywhere.
- No mid-dot separators (`·`) in copy.
- If a surface could ship unchanged in a generic shadcn starter, it is not finished yet.
