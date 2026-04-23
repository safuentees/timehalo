---
name: create-mutation-hook
description: Create or refactor custom tRPC mutation hooks in `src/lib/mutations` using this repo's toast, option-merging, and global invalidation conventions. Use when adding a new write action, moving inline `useMutation` logic into a reusable hook, or handling inline errors such as `CONFLICT`.
---

# Create Mutation Hook

Use this skill when a write flow needs a reusable custom hook. Keep raw `useMutation` usage in components to throwaway cases only.

## Start With Existing Hooks

- Open `src/lib/mutations/use-schedule-save.ts`.
- Open `src/lib/mutations/use-set-handle.ts`.
- Read `references/mutation-hook-template.md` before editing.

## Hook Contract

- Keep one file per mutation in `src/lib/mutations/`.
- Type `options` from `ReactQueryOptions["router"]["procedure"]`.
- Spread caller options first.
- Override `onSuccess` and `onError` after the spread.
- Re-invoke the caller handlers manually after the hook-specific behavior runs.

## Toast And Invalidation Rules

- Put `toast.success()` and `toast.error()` in the hook.
- Do not add per-hook query invalidation. `src/trpc/hooks.ts` already invalidates globally after mutations.
- Suppress the generic error toast only when the caller handles a specific inline error state.

## Error Mapping

- Read `references/error-mapping.md` when the mutation touches Prisma or tRPC errors.
- Prefer field-level handling for codes like `CONFLICT`.
- Keep generic failure messages user-friendly and include the original `cause` on the server side.

## Finish

- Compare the final hook against `references/mutation-hook-template.md`.
- Confirm the calling component no longer owns hook-specific toast or invalidation logic.
