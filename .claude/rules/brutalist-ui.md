---
paths:
  - "src/app/**/*.tsx"
  - "src/components/ui/**/*.tsx"
  - "src/components/brutalist/**/*.tsx"
---

# Brutalist UI

- Compose existing shadcn primitives and repo wrappers before inventing new structure.
- Keep brutalist-specific overrides in `src/components/brutalist/` and keep wrappers thin.
- Build mobile-first and avoid horizontal scroll at narrow widths.
- Prefer container queries for brutalist layouts that live inside the host shell.
- Do not ship stock shadcn visuals; use the repo's paper-and-ink palette, sharp borders, mono accents, and uppercase display style.
- In InputGroup layouts, keep the input before the addon in DOM order.
- For complex forms, keep the canonical `FieldGroup` and `FieldSet` structure intact.
- For new authenticated pages: wrap content in `BrutalistPageShell` (owns `max-w-[760px] px-4 py-8 sm:px-6 sm:py-10`) and lead with `BrutalistPageHeader title="..."`. Both in `src/components/brutalist/`. Drift is a bug — `(host)/AGENTS.md` flags this as a forcing function.
- No mid-dot separators (`·`) in copy. They read as filler — drop the separator AND audit each half against "does this carry data the user can't read elsewhere on this screen." Memory entry: `feedback_no_dot_separator.md`.
