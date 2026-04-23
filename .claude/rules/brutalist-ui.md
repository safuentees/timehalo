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
- Prefer container queries for brutalist layouts that live inside dashboard chrome.
- Do not ship stock shadcn visuals; use the repo's paper-and-ink palette, sharp borders, mono accents, and uppercase display style.
- In InputGroup layouts, keep the input before the addon in DOM order.
- For complex forms, keep the canonical `FieldGroup` and `FieldSet` structure intact.
