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

## SSR-safe client branches

When a client component branches on a browser-only signal (`useMounted()`, `useMediaQuery()`, `useTheme()`, `Intl.supportedValuesOf`, `localStorage`, `window.*`), the SSR pass and the first client render only see the **server-snapshot** value of that signal — usually `false`/`undefined`/empty. Get the branching wrong and you ship a "blank → flash to UI" hard-refresh experience (or worse, a hydration mismatch).

- **Never** `if (!mounted) return null` for any subtree containing user-visible affordances — buttons, links, form inputs, dialog triggers. The SSR HTML must include the affordance, otherwise the user sees nothing on hard refresh until the effect fires (~1 frame later). `return null` is acceptable only for components with no SSR-visible surface anyway (third-party portals that need `document`, animation primitives that need `window`).
- **Pick the SSR default to match the hook's server snapshot.** `useMediaQuery` returns `false` on the server, so structure conditionals as "render the desktop / wider branch by default; let mobile swap in after mount." `useTheme` returns no resolved theme on SSR, so render the "system"/neutral branch by default. `useMounted` returns `false` on SSR, so the SSR default is whatever the unmounted state should look like to a real user — usually a static placeholder of the same shape, not nothing.
- **Resolve runtime-derived lists on the server**, not in `useMemo`. Anything that reads `Intl.supportedValuesOf`, `Date.now()`, `Math.random()`, or other ICU/runtime data will diverge between Node and the browser. Compute the value in the server `page.tsx` and pass it to the client component as a prop — single source of truth, hydration-safe by construction. Reference: `src/app/(host)/settings/page.tsx` (timezone list via `getRuntimeTimezones()`).
- **Breakpoint-dependent primitive swaps** (responsive Dialog ↔ Drawer, sidebar ↔ topbar) must keep the trigger element rendered in both branches. Either render the trigger as a plain `<Button>` outside the primitive and use controlled `open` state, or make sure both branches render compatible trigger markup so the SSR → mounted re-render is invisible. Reference: `src/components/ui/responsive-modal.tsx` (Dialog as SSR default, Drawer swap on mobile after mount).
