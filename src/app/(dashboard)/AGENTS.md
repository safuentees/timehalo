# Dashboard Scope

- Treat `/dashboard` as the canonical reference for new authenticated pages.
- Use a server `page.tsx` for `createPrivateSSRHelper()`, query prefetching, and `HydrationBoundary`.
- Put auth and permission checks in the page, not the layout.
- Keep forms in client components.
- Use one `useForm`, `FormProvider`, and `values` plus `keepDirtyValues` for server-seeded forms.
- Use `mutateAsync()` and `Promise.allSettled()` for multi-write submits.
- Keep layouts mobile-first and consistent with the repo's brutalist language.
- Open first: `dashboard/page.tsx`, `dashboard/components/settings-form.tsx`, `dashboard/components/availability-fields.tsx`.
