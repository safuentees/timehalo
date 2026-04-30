# UI primitives scope

- Treat these files as shadcn primitives adapted for the repo; preserve the public API unless there is a clear reason to change it.
- Prefer `className` changes and thin wrappers over structural rewrites.
- Preserve slot structure, accessibility behavior, and existing exports.
- Repo-specific overrides + dashboard chrome wrappers live in `../oh/` — extend them there, not by forking the primitive here.
- In InputGroup components, keep the input element before addons in DOM order.

## Styling tokens

- Radius: `rounded-sm` (6px) for structural surfaces, `rounded-full` for pills/avatars/circles, `rounded-none` for intentional sharp edges. Do not use `rounded-md/lg/xl/2xl/3xl/4xl` — those tokens are dropped in `@theme` and render as 0px.
- Fonts: `font-sans`/`font-heading` both resolve to Space Grotesk; `font-mono` to JetBrains Mono. There is no serif font in this project.
- Full styling guidance: `.claude/rules/oh-ui.md` (file name historical, rules apply to the current chrome).

Open first: `field.tsx`, `input-group.tsx`, `item.tsx`, `empty.tsx`, `avatar.tsx`.
