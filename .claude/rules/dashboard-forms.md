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
- For pages that ARE one form (e.g. `/profile`, `/availability`), render `<BrutalistSaveBar />` from `@/components/brutalist/save-bar` immediately after `</BrutalistPageShell>` (still inside the `<form>`). It owns the spacer + sticky island + button + the disabled/label/mount-gating logic. Pass `isPending`, `isDirty` (OR in any seed-from-default flag here), and `labels` — never re-implement the save bar inline. Reference: `src/app/(host)/profile/components/profile-form.tsx`.
- For HUB pages with multiple independent sub-sections (e.g. `/settings`), do NOT use the global SaveBar. It lies about its scope — visually claims to commit the whole page while only mutating one section's data. Each sub-section owns its own commit affordance: per-section Save button, autosave on change, dialog flow, etc. Reference: `src/app/(host)/settings/components/settings-form.tsx` (no form wrapper, no SaveBar) + `src/app/(host)/settings/components/timezone-fields.tsx` (self-contained form + inline Save button).
- For "I want this UI to differ between SSR and CSR without hydration mismatch" — use `useMounted()` from `src/hooks/use-mounted.ts`. Never `useState(false) + useEffect(() => setMounted(true), [])` (React 19's compiler ESLint rule blocks it).

## SSR-safe client branches

When a client component branches on a browser-only signal (`useMounted()`, `useMediaQuery()`, `useTheme()`, `Intl.supportedValuesOf`, `localStorage`, `window.*`), the SSR pass and the first client render only see the **server-snapshot** value of that signal — usually `false`/`undefined`/empty. Get the branching wrong and you ship a "blank → flash to UI" hard-refresh experience (or worse, a hydration mismatch).

- **Never** `if (!mounted) return null` for any subtree containing user-visible affordances — buttons, links, form inputs, dialog triggers. The SSR HTML must include the affordance, otherwise the user sees nothing on hard refresh until the effect fires (~1 frame later). `return null` is acceptable only for components with no SSR-visible surface anyway (third-party portals that need `document`, animation primitives that need `window`).
- **Pick the SSR default to match the hook's server snapshot.** `useMediaQuery` returns `false` on the server, so structure conditionals as "render the desktop / wider branch by default; let mobile swap in after mount." `useTheme` returns no resolved theme on SSR, so render the "system"/neutral branch by default. `useMounted` returns `false` on SSR, so the SSR default is whatever the unmounted state should look like to a real user — usually a static placeholder of the same shape, not nothing.
- **Resolve runtime-derived lists on the server**, not in `useMemo`. Anything that reads `Intl.supportedValuesOf`, `Date.now()`, `Math.random()`, or other ICU/runtime data will diverge between Node and the browser. Compute the value in the server `page.tsx` and pass it to the client component as a prop — single source of truth, hydration-safe by construction. Reference: `src/app/(host)/settings/page.tsx` (timezone list via `getRuntimeTimezones()`).
- **Breakpoint-dependent primitive swaps** (responsive Dialog ↔ Drawer, sidebar ↔ topbar) must keep the trigger element rendered in both branches. Either render the trigger as a plain `<Button>` outside the primitive and use controlled `open` state, or make sure both branches render compatible trigger markup so the SSR → mounted re-render is invisible. Reference: `src/components/ui/responsive-modal.tsx` (Dialog as SSR default, Drawer swap on mobile after mount).

## Hover + color contracts

Two anti-patterns produce buttons that go invisible at one of their states. Don't ship either.

- **Never add an arbitrary text-size class on a button whose variant already sets a text color via the same `text-` prefix.** `cn()` runs through `tailwind-merge`, which treats every `text-` utility as one group and keeps only the last token. Layering a size override on top of a variant that supplies a paper-on-ink color collapses the color into the size class and drops it — the button inherits the page text color (ink) and renders ink-on-ink at the overridden breakpoint. To bump button size, change `h-` and `px-` utilities. If you genuinely need a different text size, write a new variant in `button.tsx` that pairs both color and size, or force the size with the `!` modifier on the size token while leaving the color class intact (verify with DevTools).
- **Hover must increase prominence, never decrease it.** The convention across the app is `opacity-55` idle → `opacity-100` hover for tertiary text affordances (share buttons, footer links, "use browser" style). Going the other way (`opacity-100` → `opacity-55` on hover) reads as the affordance disappearing the moment the user wants it. For brand marks / always-on links, leave opacity at 100 and signal hover with `hover:underline` instead.
- **Any hover that swaps the background to the ink color must also swap the text** to paper, or the text disappears. Variants `brutalist` and `brutalistGhost` already pair both swaps; if you reach for a custom hover state (`hover:bg-bru-content`, `hover:bg-[var(--bru-ink)]`), pair it with `hover:text-bru-bg` / `hover:text-[var(--bru-paper)]` in the same className.
- **Global link resets must not set color outside Tailwind layers.** Tailwind Preflight already makes plain anchors inherit color. A shell rule like `.scope a { color: inherit; }` can beat utility classes such as `text-bru-paper` on link-styled buttons because unlayered CSS wins over layered utilities.

## Hub-page sub-section chrome

For multi-section pages (`/settings` today; future user/team management hubs):

- Every sub-section uses `<SectionHeader>` from `src/app/(host)/settings/components/section-header.tsx`. Pass `legendId` and bind `aria-labelledby={legendId}` on the section wrapper. Convention: `<role>-legend` (e.g. `timezone-legend`, `workflows-legend`). One naming pattern across the hub.
- The header has three slots: `legend` (always), `title` (only the danger zone uses it for now — emphasized subhead), `description` (5-10 word sentence, never internal jargon), and `action` (primary CTA inline-end on bigger screens, e.g. "Add workflow" / "Create key"). Audit pattern: cal.com puts the action right of the legend; we follow.
- Section spacing: stack with `flex flex-col gap-12` on the parent (24*2 = 48px breathing). Each section header to its content uses `mt-5`. Each section wraps in a `<section>`, never `<div>`.
- Sub-section action layout: action buttons sit BELOW the controls, not in a separate footer band, not inline-end. References: `timezone-fields.tsx` (Use browser + Save below the select), `workflow-fields.tsx` (Add workflow below the list).

## Dialog composition

Every dialog inside the host shell composes from the `responsive-modal.tsx` primitives — never inline padding/flex strings. Audit on 2026-04-27 found 12+ verbatim duplications across four dialogs.

- `<ResponsiveModalContent>` — the popup shell.
- `<ResponsiveModalHeader>` — wraps the title; bakes `px-5 pb-4 sm:px-6` padding.
- `<ResponsiveModalTitle>` — bakes `text-[20px] font-black uppercase tracking-tight` (the project's dialog-title chrome).
- `<ResponsiveModalBody>` — wraps non-form bodies; bakes `flex flex-col gap-5 px-5 pb-6 sm:px-6`.
- `<ResponsiveModalFooter>` — wraps cancel + confirm buttons; bakes `flex flex-col gap-2 sm:flex-row sm:justify-end`.

For `<form>`-shaped bodies (the form must own its own className), import `RESPONSIVE_MODAL_BODY_CLASS` and apply it directly to the `<form>` element — same string baked into `<ResponsiveModalBody>`, no drift.
