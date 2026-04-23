---
paths:
  - "src/lib/mutations/**/*.ts"
---

# Custom Mutation Hooks

- Keep one custom hook per mutation file in `src/lib/mutations/`.
- Type hook options from `ReactQueryOptions["router"]["procedure"]`.
- Spread caller `options` first, then override `onSuccess` and `onError`, and re-invoke caller handlers manually.
- Put `toast.success()` and `toast.error()` in the hook, not in the calling component.
- Do not duplicate query invalidation in the hook; rely on the global `src/trpc/hooks.ts` override.
- Suppress the generic error toast only when the caller handles a specific inline error such as `CONFLICT`.
