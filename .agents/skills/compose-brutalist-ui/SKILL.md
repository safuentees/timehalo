---
name: compose-brutalist-ui
description: Compose or refactor UI in `src/app`, `src/components/ui`, or `src/components/brutalist` using this repo's brutalist design language on top of shadcn primitives. Use when choosing between `Field`, `InputGroup`, `Item`, `Empty`, `Card`, `Badge`, and `Avatar`, or when a page risks looking like stock shadcn.
---

# Compose Brutalist UI

Use this skill for layout and composition work on brutalist pages and wrappers. If the task is mostly about data loading or dashboard form architecture, also consult `build-dashboard-page`.

## Start With Existing Primitives

- Open the closest existing primitive in `src/components/ui/`.
- Open the matching wrapper in `src/components/brutalist/` if one exists.
- Read `references/component-trees.md` before changing structure.

## Composition Rules

- Extend existing shadcn primitives instead of rebuilding them from scratch.
- Put brutalist-specific class overrides in `src/components/brutalist/`.
- Preserve accessibility and slot structure when editing `src/components/ui/`.
- In InputGroup layouts, keep the input before the addon in DOM order.
- For forms, keep the `FieldGroup`, `FieldSet`, and submit-row structure consistent.

## Visual Rules

- Build mobile-first.
- Prefer container-query-aware layouts for brutalist pages inside dashboard chrome.
- Use the repo's paper-and-ink palette, mono accents, sharp borders, and uppercase display style.
- Rework anything that looks like stock shadcn before finishing.

## Finish

- Review `references/design-checklist.md`.
- Compare the final shape against `references/component-trees.md`.
- Reuse an existing wrapper before adding a new primitive or variant.
