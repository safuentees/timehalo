---
paths:
  - "src/app/(dashboard)/**/*.tsx"
  - "src/app/h/**/*.tsx"
---

# Dashboard Forms And SSR

- Keep authenticated page wiring in the server `page.tsx`: use `createPrivateSSRHelper()`, prefetch queries, and return `HydrationBoundary`.
- Put permission checks in `page.tsx`, not the layout.
- Keep forms in client components.
- Use one `useForm` per logical form and wrap nested sections in `FormProvider`.
- When a form is seeded from server data, prefer `useForm({ values, resetOptions: { keepDirtyValues: true } })` over `defaultValues`.
- In child sections, use `Controller<FormShape>`, `useFieldArray<FormShape>`, and `useWatch<FormShape>` instead of nested forms.
- Use `mutateAsync()` and `Promise.allSettled()` for parallel writes.
- Render inline field conflicts with `form.setError`; let custom mutation hooks own general toast behavior.
