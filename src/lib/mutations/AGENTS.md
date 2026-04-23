# Mutation Hooks Scope

- Keep one reusable hook per mutation file.
- Type `options` from `ReactQueryOptions["router"]["procedure"]`.
- Spread caller options first, then override `onSuccess` and `onError`, and call the caller handlers yourself.
- Put toasts here, not in components.
- Do not add per-hook invalidation; rely on the global override in `src/trpc/hooks.ts`.
- Use existing hooks as templates before inventing a new pattern.
