---
name: build-dashboard-page
description: Build or refactor authenticated pages in `src/app/(dashboard)` that follow this repo's server-first Next.js pattern. Use when adding a dashboard route, wiring SSR prefetch with `createPrivateSSRHelper` and `HydrationBoundary`, building a react-hook-form surface with `FormProvider`, or debugging a dashboard form backed by tRPC and Prisma.
---

# Build Dashboard Page

Use this skill for authenticated dashboard routes and their client form shells. Keep visual-only work narrow; if the task is mostly UI composition, also consult `compose-brutalist-ui`.

## Start With Canonical Files

- Open `src/app/(dashboard)/dashboard/page.tsx`.
- Open `src/app/(dashboard)/dashboard/components/settings-form.tsx`.
- Open `src/app/(dashboard)/dashboard/components/availability-fields.tsx`.
- Read `references/architecture-checklist.md` before writing code.

## Server Page Pattern

- Keep auth and permission checks in the server `page.tsx`.
- Use `createPrivateSSRHelper()` for authenticated pages.
- Prefetch queries on the server and return `HydrationBoundary`.
- Mount the client form or interactive shell from the hydrated server page.

## Client Form Pattern

- Keep one `useForm` per logical form.
- When the form is seeded from query data, use `values` plus `resetOptions.keepDirtyValues`.
- Use `FormProvider` when child sections need `Controller`, `useFieldArray`, `useWatch`, or `useFormContext`.
- Keep nested sections as readers of the parent form store. Do not create nested forms.

## Submit And Error Pattern

- Use existing custom mutation hooks from `src/lib/mutations/`.
- Use `mutateAsync()` instead of `mutate()` when sequencing or parallelizing.
- Use `Promise.allSettled()` when multiple writes should run independently.
- Render field-specific conflicts inline with `form.setError`.
- Leave generic success and failure toasts inside the custom hook layer.

## When Debugging

- Read `references/form-debugging.md` for the common failure modes in this repo.
- Verify that `pnpm dev` was restarted after any Prisma client regeneration.

## Finish

- Compare the implementation against `references/architecture-checklist.md`.
- Run the relevant checks for the touched files before concluding.
