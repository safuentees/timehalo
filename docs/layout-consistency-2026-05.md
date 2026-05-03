# Layout Consistency Vocabulary — 2026-05

**Status**: research output for B.PT104. Single design doc, no code in this commit. Sets the unified target every B.PT105+ page refactor implements.

**Why this exists**: user audit on 2026-05-03 named three structural problems
across the app, ALL of them rooted in pages diverging from a shared shape:

1. Pages don't match each other — `/login`, `/h/<handle>`, `/bookings`,
   `/settings/*`, `/booked/<uid>` each use a different shell.
2. Short pages still scroll — short-content auth + error pages leave empty
   space below the column AND the body still scrolls because no viewport-fill
   discipline runs OUTSIDE the dashboard route group.
3. Field focus state — solid 2px black outline + offset (`globals.css:1624`)
   reads as aggressive vs the soft halo+ring patterns cal.com / dub.co /
   shadcn all use.

The dashboard (`(host)/*`) already implements fixed-chrome + scrollable-middle
correctly via `oh-app-shell` (`height: 100svh`) + `body:has(.oh-app)
{overflow:hidden}` (`globals.css:304`). The auth + visitor + error surfaces
do not. This doc unifies the vocabulary so every surface inherits the same
discipline.

---

## 1. Reference patterns (read sequentially, not skipped)

### cal.com — `apps/web/modules/shell/Shell.tsx`

Outer dashboard shell:
```tsx
<div className="flex min-h-screen flex-col">
  {banners}
  <div className="flex flex-1" data-testid="dashboard-shell">
    <SideBarContainer />
    <div className="flex w-0 flex-1 flex-col">
      <MainContainer>...</MainContainer>
    </div>
  </div>
</div>
```

`MainContainer` (line 200): `<main className="bg-default relative z-0
flex-1 focus:outline-none">` — flex-1 absorbs remaining height.

`ShellMain` (line 127): optional sticky header via `disableSticky` prop —
`sticky top-0 z-10` when not disabled. Heading + `CTA` slot + `actions`
slot all in one row.

**Inputs** (`packages/ui/components/form/inputs/TextField.tsx:14-54`):
```ts
cva([
  "rounded-[10px] border",
  "bg-default border-default text-default",
  "hover:border-emphasis",
  "focus:border-emphasis",
  "focus:ring-0",
  "focus:shadow-outline-gray-focused",   // ← key
  "shadow-outline-gray-rested",          // ← rested elevation
  "transition-all",
])
```

`shadow-outline-gray-focused` is a **two-layer box-shadow** defined in
`packages/config/theme/tokens.css`:
```css
--shadow-outline-gray-focused:
  0px 0px 0px 1px rgba(255, 255, 255, 0.20),     /* inner halo */
  0px 0px 0px 2px rgba(0, 0, 0, 0.10);            /* outer soft ring */
```

Pattern: kill the default Tailwind `ring`, replace with a soft elevated
shadow. The border color bumps to `border-emphasis` on focus. Total cost
is two `box-shadow` layers + a border color swap — no harsh outline.

### dub.co — `apps/web/ui/layout/main-nav.tsx`

```tsx
<div className="min-h-screen md:grid md:grid-cols-[min-content_minmax(0,1fr)]">
  {/* sidebar — sticky on desktop */}
  <div className="fixed left-0 z-50 ... md:sticky md:z-auto md:w-full">
    <Sidebar />
  </div>
  {/* main — h-screen frame, INNER scroll */}
  <div className={cn(
    "bg-neutral-200 ...",
    isUpgradeBannerVisible ? "mt-12 h-[calc(100vh-48px)]" : "h-screen",
  )}>
    <div className="relative h-full overflow-y-auto bg-neutral-100 pt-px md:rounded-xl md:bg-white">
      {children}
    </div>
  </div>
</div>
```

KEY pattern — the **outer right-column is a fixed-height frame**
(`h-screen` minus optional banner offset); the **inner panel scrolls**
(`h-full overflow-y-auto`). Body itself never scrolls. This matches
exactly what the user described — chrome stays fixed, middle scrolls.

`PageContent` (`apps/web/ui/layout/page-content/index.tsx`):
```tsx
<div className="flex min-h-full flex-col rounded-t-[inherit] bg-neutral-100 md:bg-white">
  <PageContentHeader {...} />
  <div className="flex-1 rounded-t-[inherit] bg-white pt-3 lg:pt-6">
    {children}
  </div>
</div>
```

Page-level: `min-h-full flex-col` so the page fills the inner scroll
container even when content is short. Header is a flex row, content is
`flex-1`. No empty space below short content.

`PageWidthWrapper` (`apps/web/ui/layout/page-width-wrapper.tsx`):
```tsx
<div className="@container/page mx-auto w-full max-w-screen-xl px-3 lg:px-6">
```

Container query named (`@container/page`) so children can adapt to inset
width, not viewport. Same idea our `oh-root` does (`container-name:
oh-root`).

**Auth layout** (`apps/web/app/app.dub.co/(auth)/layout.tsx:12`):
```tsx
<div className="relative grid min-h-[100dvh] min-h-screen grid-cols-1
                min-[900px]:grid-cols-[minmax(0,1fr)_440px]
                lg:grid-cols-[minmax(0,1fr)_595px]">
  {/* form column */}
  <div className="relative flex min-h-[100dvh] min-h-screen w-full justify-center">
    {children}
  </div>
  <SidePanel />
</div>
```

Auth: viewport-fill via `min-h-[100dvh]` on BOTH outer grid AND form
column; form column uses `flex justify-center` so the form sits centered
horizontally with branding above it. Sidebar panel only at `min-[900px]`.

**Inputs** (`packages/ui/src/input.tsx:26`):
```tsx
"rounded-md border border-neutral-300 ...
 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500"
```

Single-color border + ring. Kills default outline. Simpler than cal's
two-layer halo but same idea — no aggressive solid outline.

### shadcn — `src/components/ui/input.tsx` (current repo, vendored shadcn)

```tsx
"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
```

3px ring at 50% opacity. `focus-visible` (not `focus`) so mouse clicks
don't trigger the visual — only keyboard nav does. Border color swap
to `--ring`.

### Apple HIG (web-relevant principles)

Apple HIG isn't a CSS framework — it's a set of principles. The ones
that map onto this app:

- **Clarity** — type and color reinforce hierarchy. Already honored: we
  ratchet the typography scale via `oh-legend` / `oh-eyebrow` /
  `oh-description` utilities.
- **Deference** — content is primary; chrome is subordinate.
  Implication: the sidebar + topbar should not announce themselves;
  inputs should not announce themselves on focus louder than the value
  the user is editing.
- **Depth** — distinct visual layers via subtle shadow / hairlines, not
  thick borders. Already partially honored: the dashboard chrome uses
  hairlines.
- **Consistency** — same affordance reads the same everywhere.
  THIS is the rule the user is invoking. The 5+ different shell shapes
  break it.
- **Adaptive layouts** — fluid across sizes. Container queries (already
  in `oh-root`) honor this; we extend the same pattern to non-dashboard
  shells.

Apple-HIG-specific viewport rules for desktop apps:
- **Window content fills the window naturally** — short pages don't
  leave dead whitespace at the bottom. → unified viewport-fill rule.
- **Toolbars / sidebars are persistent** — chrome doesn't scroll with
  content. → already true in dashboard, extend to auth/visitor.
- **No gratuitous scrolling** — if content fits, no scroll appears. →
  body overflow:hidden + inner panel `min-h-full flex-col`.

Form-specific HIG:
- **Group related fields** — visual grouping via spacing or hairline
  rule, not via heavy boxes.
- **Single primary action per screen** — already honored in our
  `<InlineFormSave>` pattern.
- **Inline validation** — already honored via `<FieldError>`.
- **Focus indicators are subtle and visible** — soft ring, NOT solid
  outline.

---

## 2. Audit — current divergence in this app

| Surface | Shell | Width | Viewport-fill? | Header | Footer |
|---|---|---|---|---|---|
| Dashboard `(host)/*` | `OhDashboardLayout` → `OhPageShell` | 760 / 672 / wide-progressive | ✅ `100svh` outer + `body:overflow:hidden` + inner ScrollArea | `OhDashboardBar` (sticky) | none |
| Auth `/login`, `/register` | bespoke `<div className="min-h-screen">` + `<main className="max-w-[420px] pt-12">` | 420 fixed | ⚠️ `min-h-screen` only — content top-aligned, no flex-fill so the column doesn't centerVertically | none (just an `<h1>`) | none |
| Visitor `/h/[handle]` | `oh-root` (`min-h: 100vh`) → `<HostProfile>` | 640 hero + 480 picker | ⚠️ `oh-root` fills viewport; `oh-main` does NOT — `position:relative; z-index:2; min-width:0` only | none | none |
| Visitor team `/w/[slug]/*` | bespoke (similar to `/h/`) | varies | ⚠️ same issue as `/h/` | none | none |
| Receipt `/h/<handle>/booked/<uid>` | bespoke `flex min-h-dvh flex-col` | 440 → 560 → 680 | ✅ correct flex-col + `flex-1 main` + `<footer>` (sm+) | sticky `<header>` | optional `<footer>` (md+) |
| Receipt `/w/<slug>/<eventTypeSlug>/booked/<uid>` | bespoke (similar to host receipt) | varies | ✅ similar | sticky | optional |
| 404 `/not-found.tsx` + 500 `/error.tsx` | `ErrorShell` → `<main className="oh-main">` | 760 | ❌ `oh-main` has NO min-height + NO flex; content sits at top of `oh-root` with empty space below if shorter than viewport | none | none |

**Key observations**:
- Dashboard discipline is correct. Don't re-architect it.
- Auth + visitor + error surfaces are the divergent ones.
- The booking-confirmation receipt is the closest existing reference for
  the auth/visitor/error target shape — `<div className="flex min-h-dvh
  flex-col">` outer, sticky `<header>`, `<main className="flex-1">`,
  optional `<footer>`.
- Width inconsistency: 420 / 440 / 480 / 640 / 760. We standardize on
  three widths total: **narrow (420)** for auth, **content (760)** for
  text + forms (matches `OhPageShell` default), **hero (640)** for
  visitor profile + receipt header.

---

## 3. Proposed unified vocabulary

### 3.1 Shell primitives (three, one per surface family)

All three follow the same skeleton: viewport-fill outer + sticky-header
slot + flex-1 main + optional sticky-footer slot.

#### `OhDashboardLayout` (existing — keep as-is)

Already correct. Don't touch the structure. Only the input focus
treatment (3.3 below) propagates here too.

#### `OhAuthShell` (NEW — for `/login`, `/register`)

```tsx
<div className="flex min-h-dvh flex-col bg-oh-frame text-oh-ink">
  <OhAuthHeader />                                  {/* optional brand mark */}
  <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6">
    <div className="w-full max-w-[420px]">
      {children}
    </div>
  </main>
  <OhAuthFooter />                                  {/* optional legal/links */}
</div>
```

Key differences from current `/login`:
- `flex flex-col` outer (so `flex-1` on `<main>` actually fills).
- `<main>` uses `flex flex-1 flex-col items-center justify-center` —
  centers the form vertically when content is short, top-aligns when
  content overflows (browsers honor `justify-center` only as long as
  content fits; otherwise the overflow direction wins). Apple HIG
  "window content fills the window naturally" applied verbatim.
- Brand chrome moves into `<OhAuthHeader>` (currently absent — auth
  pages have no logo at all). The header is NOT sticky for auth — the
  page is short and the header sticky has no purpose here. We use
  `<OhAuthHeader>` for layout consistency, not for stickiness.
- `<OhAuthFooter>` for legal links (terms, privacy) IF needed; keep it
  empty by default.

#### `OhVisitorShell` (NEW — for `/h/<handle>`, `/w/<slug>`,
booked receipts, `/preview/*`)

```tsx
<div className="flex min-h-dvh flex-col bg-oh-bg text-oh-content">
  <OhVisitorHeader />                               {/* sticky brand mark + handle ref */}
  <main className="flex-1">
    {children}
  </main>
  <OhVisitorFooter />                               {/* sm+ only — brand + receipt stamp on receipts */}
</div>
```

This is exactly what `booking-confirmation.tsx` already does inline.
Lift it into `<OhVisitorShell>` so `/h/<handle>` + `/w/<slug>/*` +
`/booked/*` all share the chrome shape.

The booking-confirmation receipt already has a `<header>` with `border-b
border-oh-line` and `<Link>` brand mark left + handle ref right. Reuse
that header verbatim. Footer too — `hidden ... sm:flex` so mobile
receipts skip the footer (there isn't space for it).

`<main className="flex-1">` ensures short-content visitor pages fill the
viewport — short `/h/<handle>` profiles no longer leave a band of empty
`oh-frame` below the column.

#### `OhErrorShell` (existing component — modify to add viewport fill)

Add the same `flex min-h-dvh flex-col` discipline to `ErrorShell` so
404 + 500 fill the viewport.

```tsx
// before (broken)
<main className="oh-main">
  <div className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
    {/* ... */}
  </div>
</main>

// after
<main className="oh-main flex min-h-dvh flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
  <div className="w-full max-w-[760px]">
    {/* ... */}
  </div>
</main>
```

Center the error column vertically — there's no other content on the
page, so the error message belongs in the optical center, not pinned
to the top. Apple HIG's "deference / clarity" — the error IS the
content, surface it.

`oh-root` already provides the `min-h: 100vh` outer for `not-found.tsx`
+ `error.tsx`. The `<main>` change above adds the flex-fill discipline
INSIDE `oh-root`.

### 3.2 Width vocabulary (three sizes, one per surface family)

| Token | Width | Surfaces |
|---|---|---|
| `oh-w-narrow` | 420px | auth (login / register / forgot-password) |
| `oh-w-content` | 760px (default `OhPageShell`) | dashboard pages, error shells, visitor receipts |
| `oh-w-hero` | 640px | visitor profile hero (`/h/<handle>`'s name + bio block) |

`OhPageShell` already supports `tight` (672) + `wide` (760→1024). Keep
those — the dashboard's flexibility serves real density needs (settings
hub vs `/bookings` table). The new tokens are for non-dashboard shells.

### 3.3 Field focus refactor (THE big one — applies to every input app-wide)

Current (`globals.css:1624`):
```css
.oh-input:focus {
  outline: 2px solid var(--oh-ink);
  outline-offset: 2px;
}
```

Solid 2px ink outline + 2px offset. Two problems: (a) the outline reads
as a popping border that fights the input's existing 1.5px ink border,
(b) the offset creates a `2 + 2 + 1.5 = 5.5px` total visual stack that
overpowers the input value the user is editing — "louder than the
content" (HIG violation).

**Proposed (cal.com-inspired, adapted to oh tokens)**:

```css
.oh-input {
  /* existing properties stay */
  border: 1.5px solid var(--oh-line);     /* hairline at rest, not full ink */
  outline: 0;
  transition: border-color var(--oh-t-fast), box-shadow var(--oh-t-fast);
}
.oh-input:focus,
.oh-input:focus-visible {
  border-color: var(--oh-ink);             /* bump to full ink on focus */
  box-shadow:
    0 0 0 1px var(--oh-paper),             /* inner halo — paper, separates ring from border */
    0 0 0 3px color-mix(in srgb, var(--oh-ink) 18%, transparent);  /* outer soft ring */
}
```

Two-layer box-shadow halo+ring (cal.com pattern), no `outline` (kill
the default browser outline). Same vocabulary applies to:
- `<input>` / `<textarea>` / `<select>` (`oh-input`, `oh-textarea`,
  `oh-select`)
- shadcn `<Input>` primitive (override the existing `focus-visible:`
  utilities to use the same halo+ring)
- Buttons (`<Button variant="oh">`, `<Button variant="ohGhost">`,
  bare `<button>` chrome triggers like the sidebar collapse + the
  morphing hamburger)
- Sidebar nav rows + menu items
- Dialog triggers + close affordances

**Token additions to `:root`**:
```css
--oh-focus-halo: 0 0 0 1px var(--oh-paper);
--oh-focus-ring: 0 0 0 3px color-mix(in srgb, var(--oh-ink) 18%, transparent);
--oh-focus-shadow: var(--oh-focus-halo), var(--oh-focus-ring);
```

Then every focus target writes `box-shadow: var(--oh-focus-shadow);` —
single source of truth. If the user wants to tune the ring opacity
later, one variable changes everywhere.

**Why 18% opacity (not cal's 10% or shadcn's 50%)**: 10% is invisible
on the `oh-frame` cream bg, 50% is too loud against the high-contrast
ink palette. 18% is the sweet spot the dashboard's hairline tokens
already use (`--oh-line-soft` is `color-mix(in srgb, var(--oh-ink)
~18%, transparent)`-equivalent — verify against actual computed value
when implementing).

**Why `focus-visible` matters**: mouse clicks on an input shouldn't
trigger the keyboard-focus ring. Modern browsers expose `focus-visible`
to draw the ring only for keyboard navigation. Apple HIG "subtle and
visible" — visible to keyboard users who need it, invisible to mouse
users who don't. Tailwind shadcn already does this; oh-input doesn't.

### 3.4 Viewport-fill rule (universal)

Every top-level route's outermost wrapper MUST be one of:

- `min-h-dvh flex flex-col` (auth / visitor / error / receipt — content
  in the middle, optional sticky chrome)
- `oh-app-shell` (dashboard — already correct)
- `oh-root` for the visitor surface (already provides `min-h: 100vh`,
  but children must still wrap in `flex flex-col` if they want
  short-content fill)

`min-h-dvh` (dynamic viewport units) NOT `min-h-screen` (static).
Mobile Safari shrinks the address bar on scroll — `dvh` accounts for
the keyboard + chrome correctly. Both work but `dvh` is the modern
canon (caniuse: 92%+ support 2026).

Body overflow: the dashboard already kills body scroll via
`body:has(.oh-app) { overflow: hidden; }`. Auth + visitor + error
surfaces DO need body scroll IF content overflows — mobile keyboards
push content up, and inner-only scroll containers can clip the active
input. So we DON'T extend `body:overflow:hidden` to non-dashboard
surfaces. The `flex min-h-dvh flex-col` pattern naturally only fires
the body scroll when content exceeds viewport — short content stays put.

### 3.5 Header / footer chrome positioning

| Surface family | Header sticky? | Footer? |
|---|---|---|
| Dashboard | NO (lives outside the scroll container by design — `OhDashboardBar` is sticky to the viewport via `oh-app-shell` flex-col) | NO |
| Auth | NO (page is short, sticky has no purpose) | OPTIONAL — legal links only, `<footer className="text-center pb-6 text-[12px] opacity-55">` |
| Visitor | YES — `<header className="sticky top-0 z-10 border-b border-oh-line bg-oh-bg/80 backdrop-blur">` so the brand+handle ref stays visible while scrolling long booking flows | OPTIONAL — `hidden sm:flex` brand + receipt stamp footer (already on `booking-confirmation.tsx` template) |
| Error | NO (page is short by design, sticky is overkill) | NO |

The "sticky vs. not" call is per-surface based on whether the chrome
gives the user navigation context that's worth keeping visible while
they scroll. Visitor flows (long picker → form → confirm) benefit;
auth + error pages are short enough that the chrome is always visible
without stickiness.

---

## 4. Per-page deliverable map (B.PT105 onwards)

Each row is a single B.PT## commit. Order optimizes for "ship the
shared primitives first, then refactor pages to use them."

| ID | Title | Scope |
|---|---|---|
| **B.PT105** | Field focus refactor (CSS sweep) | `globals.css` `--oh-focus-*` tokens + `.oh-input:focus` rewrite. Update `Input` primitive. Update Button variants. Update Sidebar items, menu items, dialog close. Run hydration smoke. Test touch / keyboard / mouse all behave correctly. NO page refactors yet. |
| **B.PT106** | New `OhAuthShell` + `OhVisitorShell` primitives | New files `src/components/oh/oh-auth-shell.tsx` + `src/components/oh/oh-visitor-shell.tsx`. Lift the chrome shape from `booking-confirmation.tsx`. NO page refactors yet — primitives only, no consumers. |
| **B.PT107** | Refactor `/login` to `OhAuthShell` | First page consumer. Run Playwright auth setup smoke + manual mobile keyboard test. |
| **B.PT108** | Refactor `/register` to `OhAuthShell` | Mirror of B.PT107. |
| **B.PT109** | Refactor `not-found.tsx` + `error.tsx` to viewport-fill `ErrorShell` | Update `ErrorShell` itself + verify both consumers. |
| **B.PT110** | Refactor `/h/<handle>` to `OhVisitorShell` | Sticky header wraps existing `<HostProfile>` content. |
| **B.PT111** | Refactor `/h/<handle>/booked/<uid>` to `OhVisitorShell` | The receipt — the existing inline shape becomes the primitive's reference impl. Mostly a rewrite-into-primitive. |
| **B.PT112** | Refactor `/w/<slug>` + `/w/<slug>/<eventTypeSlug>` + `/w/<slug>/<eventTypeSlug>/booked/<uid>` | Team variants. |
| **B.PT113** | Refactor `/preview/<handle>` to `OhVisitorShell` | Already preview-mode chrome via `data-oh-preview` — verify the shell wraps without breaking the morph. |
| **B.PT114** | Verification pass — every page screenshot + chrome consistency check | NO code change unless a regression surfaces. |

**Out of scope for this workstream** (kept on existing surfaces):
- Dashboard layout (`OhDashboardLayout`, `OhPageShell`). Discipline is
  already correct. Field focus refactor (B.PT105) reaches it as a CSS
  sweep but no structural changes.
- Color / typography tokens (`--oh-*`, Space Grotesk, JetBrains Mono).
  User explicitly confirmed: "structure unification only — keep colors
  + typography unchanged."
- Width vocabulary in `OhPageShell` — already serves real needs.
- Brutalist motifs that already migrated to `oh-*` tokens. No undo.

---

## 5. Field focus scope (per user confirmation: "everything")

Apply `--oh-focus-shadow` to every keyboard-focusable element across the
app — not just inputs. Concrete inventory (what changes in B.PT105):

- `<Input>` primitive (`src/components/ui/input.tsx`) — replace
  `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`
  with the new tokens
- `<Textarea>` primitive (same idea)
- `<OhSelect>` (`src/components/oh/oh-select.tsx`)
- `oh-input` CSS class (`globals.css:1624`)
- `oh-input-group` focus-within ring
- Button focus-visible (every variant — `oh`, `ohGhost`, `outline`,
  `secondary`, etc.)
- Sidebar nav row focus (`menuButtonClass` in `oh-app-sidebar.tsx`)
- Mobile menu trigger (`oh-menu-trigger.tsx`)
- Sidebar collapse trigger (`FooterControls` in `oh-app-sidebar.tsx`)
- Menu items (`Menu.Item` from Base UI — currently
  `focus-visible:outline ...` in `oh-dashboard-bar.tsx` chrome icons)
- Dialog close affordances (`<ResponsiveModalHeader>`'s X button)
- Tab triggers (`TabsTrigger`)
- Switch (`<Switch>`)
- Checkbox (the GFM-rendered task-list checkbox in `dev-checklist-content.tsx`)
- Radio (calendars / preferences pickers)
- ConfirmDialog typed-input field (`delete-account-dialog.tsx`)

Search-and-replace script (B.PT105 phase 3 plan reference):
- grep `focus:outline\|focus:ring\|focus-visible:ring\|focus-visible:outline`
  across `src/`, replace with the new utility / token consistently.
- One file per logical primitive, one CSS rule per logical class — no
  one-off `focus:ring-...` overrides on consumer callsites.

---

## 6. Decisions explicitly NOT made by this doc (defer to consumer commits)

- **Animation on focus** — no transition on the box-shadow appear by
  default (matches cal.com — no animation). If we want a subtle 100ms
  ease, add it to the `--oh-t-fast` token consistently. Decide in B.PT105.
- **Dark mode** — the focus shadow's halo color (`--oh-paper`) flips
  with dark mode automatically because `--oh-paper` is theme-aware.
  No extra rule needed. Verify at B.PT105 implementation.
- **Mobile soft-keyboard behavior on auth** — `flex min-h-dvh
  justify-center` will push the form down when the keyboard opens.
  iOS handles this OK in Safari 17+; Android Chrome behavior varies.
  Decide whether to switch to `items-start` + `pt-N` on mobile in B.PT107
  if the Playwright mobile smoke fails.
- **Preview-mode chrome morph** — `OhVisitorShell` lives outside the
  dashboard's `data-oh-preview` mechanism. `/preview/<handle>` may need
  bespoke handling — decide in B.PT113.

---

## 7. Acceptance criteria (every B.PT105+ commit verifies these)

- [ ] Hard-refresh the page on a 6" mobile viewport — no horizontal
      scroll, no scroll if content fits.
- [ ] Hard-refresh on a 27" desktop viewport — content fills the column;
      no orphan whitespace below the form on auth / visitor / error.
- [ ] Tab through every interactive element — focus ring is the new soft
      halo+ring, never the legacy solid 2px outline.
- [ ] Click any input with the mouse — no aggressive focus ring (only
      keyboard nav triggers it).
- [ ] Sidebar / topbar persists across content scroll on dashboard +
      visitor surfaces (where applicable).
- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm lint` 0 errors.
- [ ] `pnpm test:run` baseline holds (5 pre-existing failures from B.PT101
      verification — workspaces-invitations + webhooks; flag if new ones).
- [ ] `pnpm exec playwright test` — auth setup + hydration smoke pass.

---

## 8. Original-to-us bookkeeping

Per user: "take inspiration but keep original to us."

What we KEEP unchanged through this workstream:
- `--oh-*` color tokens (frame, paper, ink, line variants)
- Space Grotesk + JetBrains Mono pairing
- `oh-legend` / `oh-eyebrow` / `oh-description` typography utilities
- Hairline border discipline (1px content / 1.5px structural / 2px page header)
- Sentence-case headings
- `--oh-r-xs` (2px) / `--oh-r-sm` (6px) radius scale (no other tokens)
- `oh-input` 1.5px border at rest (changes to ink-on-focus instead of stays
  ink-always — slight contrast lift, same vocabulary)
- `<InlineFormSave>` save vocabulary
- `<ConfirmDialog>` destructive vocabulary
- `<ResponsiveModal>` dialog composition

What CHANGES:
- Outermost wrappers on auth/visitor/error get the unified
  `flex min-h-dvh flex-col` + sticky-chrome rule
- Field focus state becomes soft halo+ring everywhere
- Width vocabulary documented as 3 tokens (auth/content/hero) instead
  of inline magic numbers
- Two new shell primitives (`OhAuthShell` + `OhVisitorShell`)

The result reads as US — same palette, same type, same hairlines, same
density. Just the FRAME each page sits in finally agrees with itself.
