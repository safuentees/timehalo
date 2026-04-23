# UI Primitives Scope

- Treat these files as shadcn primitives adapted for the repo; preserve the public API unless there is a clear reason to change it.
- Prefer `className` changes and thin wrappers over structural rewrites.
- Preserve slot structure, accessibility behavior, and existing exports.
- Brutalist-specific styling belongs in `../brutalist/`, not by forking the primitive.
- In InputGroup components, keep the input element before addons in DOM order.
- Open first: `field.tsx`, `input-group.tsx`, `item.tsx`, `empty.tsx`, `avatar.tsx`.
