# Host Scope

- Routes are noun-named from the user's vocabulary (`/bookings`,
  `/availability`, `/profile`, `/settings`). Avoid generic
  "/dashboard" — that's a developer term.
- The route group `(host)` is private — pages call `auth()` /
  `createPrivateSSRHelper()` and redirect unauthenticated users.
- One screen, one purpose (Apple HIG). Don't combine
  conceptually-unrelated forms; split into separate routes and
  link between them.
- Use a server `page.tsx` for `createPrivateSSRHelper()`, query
  prefetching, and `HydrationBoundary`.
- Put auth and permission checks in the page, not the layout.
- Keep forms in client components.
- Use one `useForm`, `FormProvider`, and `values` plus
  `keepDirtyValues` for server-seeded forms.
- Use `mutateAsync()` for the submit; surface field-level conflicts
  via `form.setError`.
- Keep layouts mobile-first and consistent with the brutalist
  language.
- Wrap page content in `BrutalistPageShell` and lead with
  `BrutalistPageHeader title="..."`. The shell owns the canonical
  width + padding (`max-w-[760px] px-4 py-8 sm:px-6 sm:py-10`); never
  hand-roll those values inline. Future pages must match these two
  components — drift is a bug.
- Open first: `availability/page.tsx`,
  `availability/components/availability-form.tsx`,
  `profile/page.tsx`, `profile/components/profile-form.tsx`.
