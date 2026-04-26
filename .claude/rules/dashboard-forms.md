---
paths:
  - "src/app/(host)/**/*.tsx"
  - "src/app/h/**/*.tsx"
---

# Host Forms And SSR

- Keep authenticated page wiring in the server `page.tsx`: use `createPrivateSSRHelper()`, prefetch queries, and return `HydrationBoundary`.
- Put permission checks in `page.tsx`, not the layout.
- Keep forms in client components.
- Use one `useForm` per logical form and wrap nested sections in `FormProvider`.
- When a form is seeded from server data, prefer `useForm({ values, resetOptions: { keepDirtyValues: true } })` over `defaultValues`.
- In child sections, use `Controller<FormShape>`, `useFieldArray<FormShape>`, and `useWatch<FormShape>` instead of nested forms.
- Use `mutateAsync()` and `Promise.allSettled()` for parallel writes.
- Render inline field conflicts with `form.setError`; let custom mutation hooks own general toast behavior.
- Wrap page content in `BrutalistPageShell` and lead with `BrutalistPageHeader title="..."`. Both live in `src/components/brutalist/`. The shell owns the canonical width + padding; never hand-roll those values inline.
- For "I want this UI to differ between SSR and CSR without hydration mismatch" — use `useMounted()` from `src/hooks/use-mounted.ts`. Never `useState(false) + useEffect(() => setMounted(true), [])` (React 19's compiler ESLint rule blocks it).
