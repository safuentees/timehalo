# Recent changes — verification checklist

Walks every change shipped from the **2026-05-02 QA pass** + the **B.PT26 i18n sweep**. Use a fresh private window for visitor flows; sign in via `/login` for host flows. Test data: handle `hydration-e2e` from the seed script.

---

## Part A — User-facing tests

### 1. Stripe success → plan badge auto-refreshes (B.PT80 / QA-4)

- [ ] `/settings` → **Plan** → click **Upgrade to PRO** → Stripe Checkout opens
- [ ] Pay with `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Lands on `/settings/billing?billing=success`
- [ ] **Without manual reload**: badge flips FREE → PRO within ~10s, `?billing=success` strips itself, green toast confirms upgrade
- [ ] Hard-refresh — badge stays PRO

### 2. Invitation accept hydration — no email-flash on hard-load (B.PT81 / QA-2)

- [ ] As host, send an invitation to a fresh email with role ADMIN
- [ ] Open `/invitations/<token>` URL in a private window
- [ ] First paint shows a placeholder skeleton matching the final layout (greyed eyebrow + bars in email/role/inviter row positions)
- [ ] After ~200ms the skeleton swaps to real content with no layout shift
- [ ] Role displayed matches what was sent (ADMIN, not MEMBER)

### 3. Workspace rename → browser back doesn't 404 (B.PT82 / QA-1)

- [ ] As host, create workspace `acme-test` → land on `/workspaces/acme-test/members`
- [ ] Visit `/workspaces/acme-test/settings`
- [ ] Rename to `acme-renamed` → URL replaces to `/workspaces/acme-renamed/settings`
- [ ] Press browser back button — old URL `/workspaces/acme-test/settings` redirects to `/workspaces/acme-renamed/settings` (NOT 404)
- [ ] Same redirect works for `/members` and `/event-types` sub-paths
- [ ] Tear down the workspace

### 4. Workspace switcher pending affordances (B.PT84 / QA-3)

With at least 2 workspaces, click the top-bar workspace dropdown and pick a different workspace. Observe **all five** affordances:

- [ ] Trigger label optimistically shows the picked workspace name (instantly, before cookie write resolves)
- [ ] Trigger chevron swaps to a spinning Loader2 glyph
- [ ] 2px hairline progress bar appears at the very top of the viewport with indeterminate left-to-right shimmer
- [ ] Other menu rows become disabled (greyed, not clickable)
- [ ] Picked row shows a small spinner in its check-position
- [ ] Once the data refetches (~700ms-1s), all affordances clear together
- [ ] Click the same workspace that's already active → nothing flickers (early-return guard)

### 5. Embed loader end-to-end (B.PT85 / QA-5)

With dev server running, open in a browser:

```
file:///Users/santiagofuentes/Desktop/trpc-lab/.claude/worktrees/feat-ui-expose/e2e/fixtures/embed-test.html?handle=hydration-e2e&origin=http://localhost:3000
```

- [ ] Iframe injects with the hydration-e2e booking surface inside
- [ ] Message log panel prints `[message] {"originator":"OH","type":"size","height":...}` lines within ~2s, plus a `ready` event
- [ ] Click "Pick a date" inside the iframe → drawer expands, iframe height auto-resizes (a new `size` message lands in the log)
- [ ] Anonymous traffic test: open `http://localhost:3000/embed.js` in a NEW private window — serves the JS file (200 OK), does NOT redirect to `/login`
- [ ] Same for `http://localhost:3000/embed/hydration-e2e` — renders the booking surface, NOT redirect

### 6. i18n locale switch — date formatters (B.PT26)

Sign in. `/settings` → **Language** → switch to **Español**. Page reloads.

- [ ] `/bookings` — every booking row's date eyebrow reads in Spanish (`lun ene 15` instead of `MON JAN 15` — uppercase preserved by CSS, words localized)
- [ ] Click any booking → `/bookings/<uid>` detail — slot eyebrow + audit row timestamps render with Spanish month abbreviations (`ene` / `feb` / `mar`...)
- [ ] `/h/hydration-e2e` (anonymous, locale stays from cookie) — "Próximo disponible" with Spanish weekday/day eyebrow (`lun 15`)
- [ ] Switch back to English → all eyebrows revert

### 7. i18n auth pages (B.PT26)

With `oh_locale=es` cookie set, sign out.

- [ ] `/login` — title "Iniciar sesión", subtitle "Bienvenido de nuevo…", divider "o", "Continuar con GitHub", "¿Nuevo aquí?" + "Crear cuenta" link all in Spanish
- [ ] Visit `/login?error=Verification` — Spanish error banner ("Ese enlace ha expirado o ya se usó…")
- [ ] `/register` — "Crear cuenta" / "Elige un nombre. Será tu URL pública." / "¿Ya tienes una cuenta?" / "Iniciar sesión" link all in Spanish

### 8. i18n availability surface (B.PT26)

With `oh_locale=es`, sign in. `/availability`.

- [ ] Tap **Añadir más horas** (was "Add more hours") → modal opens with title **Nuevas horas**, body labels **Días** / **Desde** / **Hasta**, buttons **Quitar** / **Añadir**
- [ ] Tap **Días** row → drawer with title **Días**, day toggles, footer button **Listo**
- [ ] Trigger errors: leave days empty + tap save → error reads **Elige al menos un día**
- [ ] Set days, set start ≥ end → error reads **El fin debe ser posterior al inicio**
- [ ] Add an overlapping range → error reads **Se superpone en {days}** with day-codes inline (English short codes — that's the deferred B.PT26B work)

### 9. Invitation skeleton localized (B.PT26)

- [ ] With `oh_locale=es`, hard-navigate to `/invitations/<any-token>` (real or fake)
- [ ] First paint eyebrow reads **Invitación** (was "Invitation")

---

## Part B — Non-UI tests

### A. Account-deletion explicit cascades (B.PT83 / QA-6)

```bash
pnpm test:run src/trpc/__tests__/account-deletion.test.ts
```

- [ ] All cases pass — including "removes the user from OTHER workspaces' member lists"

Locks: deleting a user clears Membership rows in OTHER workspaces (the orphan that B.PT83 fixed via explicit `prisma.$transaction` cleanup since libsql's FK cascade is unreliable).

### B. Workspace slug history (B.PT82 / QA-1)

```bash
pnpm test:run src/trpc/__tests__/workspace-lifecycle.test.ts
```

- [ ] All cases pass — including the 4 new B.PT82 tests for slug history

Locks: rename writes a `WorkspaceSlugHistory` row; name-only updates don't; rotate A→B→A→B keeps a single row (upsert path); a different workspace claiming a former slug clears the prior history.

### C. Property-based idempotency (B.PT86)

```bash
pnpm test:run src/trpc/__tests__/bookings-create.property.test.ts
```

- [ ] 25 fast-check iterations all pass

Locks: for any v4 UUID + any concurrent-submit count in [2, 8], all submits return the same `publicUid` AND exactly one `Booking` row exists.

### D. Embed Playwright E2E (B.PT85 / QA-5)

```bash
pnpm exec playwright test embed.spec.ts --project=public
```

- [ ] Spec passes (~3-5s runtime)

Locks: cross-origin iframe mounts via `file://` parent + `http://localhost:3000` iframe; at least one `size` postMessage lands; "Pick a date" trigger renders inside the iframe.

### E. Full vitest suite — no regressions

```bash
pnpm test:run
```

- [ ] **368 passed** / 5 failed (pre-existing flakes, orthogonal) / 2 skipped

The 5 flakes live in `workspaces-invitations.test.ts` + `webhooks.test.ts:195` and need their own fix item.

### F. Full Playwright suite — no regressions

```bash
pnpm exec playwright test
```

- [ ] **24 passed** at workers=1 (~3 minute total runtime)

Covers public hydration + booking-flow + embed + authed hydration + 5-reload stress.

### G. i18n contract test still passes (B.PT26)

```bash
pnpm test:run src/trpc/__tests__/i18n.test.ts
```

- [ ] **8 passed**

Locks: locale negotiation, fallback to English, key resolution.

### H. Type check + lint clean

```bash
pnpm tsc --noEmit && pnpm lint
```

- [ ] tsc no output
- [ ] lint **0 errors** (7 pre-existing warnings in unrelated files)

---

## Known gaps to surface if you find them

- **Pre-existing test flakes** (5 vitest cases) NOT touched by this session. Tracked in B.PT80/B.PT82 BACKLOG rows.
- **B.PT26B** (deferred) — overlap-error day names + `formatDayLabel` range-compression labels still English-only when `oh_locale=es`.
- **B.PT62** — team round-robin booking flow. OPEN with 5 design branches surfaced in chat; awaiting decision before implementation.
