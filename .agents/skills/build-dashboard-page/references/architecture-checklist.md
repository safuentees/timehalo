# Dashboard Architecture Checklist

## Server page

- Use a server `page.tsx`.
- Call `createPrivateSSRHelper()` for authenticated routes.
- Prefetch the queries needed on first render.
- Return `HydrationBoundary` with the dehydrated query client.
- Keep auth and permission checks in the page, not the layout.

## Client form shell

- Keep the form in a `"use client"` component.
- Use one `useForm`.
- If query data seeds the form, prefer `values` over `defaultValues`.
- Add `resetOptions: { keepDirtyValues: true }` so background refetches do not wipe edits.
- Wrap nested sections in `FormProvider`.

## Child sections

- Use `Controller<FormShape>` for controlled fields.
- Use `useFieldArray<FormShape>` for dynamic lists.
- Use `useWatch<FormShape>` for reactive subscriptions.
- Key field-array rows by `field.id`, not by index.

## Submit flow

- Use custom mutation hooks from `src/lib/mutations/`.
- Use `mutateAsync()` when submit logic needs `await`.
- Use `Promise.allSettled()` when parallel writes should not cancel one another.
- Map field-specific server errors with `form.setError`.

## Key references

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/components/settings-form.tsx`
- `src/app/(dashboard)/dashboard/components/availability-fields.tsx`
- `src/lib/schedule.ts`
