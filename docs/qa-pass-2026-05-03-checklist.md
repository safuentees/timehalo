# 2026-05-03 verification checklist

Walks the 6 changes shipped from the 2026-05-03 agentic-loop pass
on `docs/qa-pass-2026-05-03.md`: B.PT91 → B.PT96. Use `oh_locale=es`
cookie for the i18n items (Settings → Language → Español).

---

## Part A — UI checks

### 1. Visitor booking surface i18n (B.PT91)

- [ ] Set locale to Español (`/settings → Language`)
- [ ] Open `/h/hydration-e2e` in a private window
- [ ] Trigger card shows "Elige una fecha" (was "Pick a date")
- [ ] Open the drawer — title reads "Programa tu reunión"
- [ ] Day strip aria says "Próximos días"
- [ ] Pick a day with slots — band labels read "Mañana / Tarde / Noche"
- [ ] Pick a slot — confirm drawer title "Confirmar reserva"
- [ ] Form fields labeled "Nombre / Correo / Pregunta"; placeholders `tu@ejemplo.com` / "¿De qué te gustaría hablar?"
- [ ] Submit button reads "Confirmar reserva →" / "Reservando…"
- [ ] Open the month-view (calendar icon) — title "Elige una fecha"; weekday narrow row reads `D L M X J V S` (Spanish convention — X for miércoles)

### 2. Auth form sub-components i18n (B.PT92)

- [ ] With `oh_locale=es`, sign out + visit `/login`
- [ ] Field labels read "Correo / Contraseña"; placeholders `tu@ejemplo.com` / "Introduce tu contraseña"
- [ ] Show-password toggle aria reads "Mostrar contraseña" / "Ocultar contraseña"
- [ ] Submit button "Iniciar sesión" / "Iniciando…"
- [ ] Magic-link section — label "O envía un enlace mágico", placeholder `tu@ejemplo.com`, button "Envíame un enlace de acceso"
- [ ] After sending, the success message reads "Revisa tu correo — enlace enviado a `<email>`" (with the email visibly bold)
- [ ] "Use a different email" reset reads "Usar otro correo"
- [ ] Visit `/register` — labels "Correo / Contraseña / Nombre"; placeholders `tu@dominio.com` / "8+ caracteres" / `alex`
- [ ] Type a handle — availability badge cycles through "libre" / "ocupado" / "3+" / "!"
- [ ] Help text under the handle field reads "Letras minúsculas, números, guiones." → "Disponible. Puedes cambiarlo más tarde." → etc
- [ ] Submit button reads "Crear cuenta" / "Creando…"

### 3. Profile + error page i18n (B.PT93)

- [ ] With `oh_locale=es`, visit `/profile`
- [ ] Page title reads "Perfil público" (was "Public profile")
- [ ] Section legend reads "Nombre público"
- [ ] Description reads "El identificador que los visitantes usan para llegar a tu página de reservas — officehours.app/h/<nombre>."
- [ ] Save button cycles "Guardar cambios" / "Guardando…" / "Guardado"
- [ ] Trigger an error route (e.g. visit a bogus tRPC procedure that throws) — page renders "Algo salió mal" + Spanish body + "Vuelve a intentarlo" button

### 4. Workspace switcher disabled-row dim (B.PT95)

- [ ] With at least 2 workspaces, click the top-bar workspace dropdown
- [ ] Pick a different workspace
- [ ] Observe **all five** affordances during the ~1s switch:
  - Optimistic trigger label flips to picked workspace name (B.PT84)
  - Chevron swaps to spinning Loader2 glyph (B.PT84)
  - 2px hairline progress bar at viewport top (B.PT84)
  - **Other menu rows visibly dim to ~55% opacity + cursor wait** ← **NEW in B.PT95**
  - Picked row keeps full opacity (has its own spinner glyph)
- [ ] Click an already-active workspace → no flicker (early-return guard)

### 5. Workflow optimistic-UI reference impls (B.PT96)

- [ ] Visit `/settings → Workflows`
- [ ] Toggle a workflow's Active switch — flips **instantly**, no perceptible roundtrip wait
- [ ] Click delete on a workflow — row **disappears immediately** (no fade-out wait)
- [ ] Toast confirms after the server roundtrip lands
- [ ] (Optional rollback test): if you can stop the dev server mid-toggle, the switch should rollback to the prior state + toast an error. Likely too fast to reproduce reliably.

---

## Part B — Non-UI tests

### A. i18n coverage guard (B.PT94)

```bash
pnpm test:run src/lib/__tests__/i18n-coverage.test.ts
```

- [ ] 9 tests pass (3 self-tests + 4 clean-dir checks + 1 clean-file check for `error.tsx`)

To prove the test bites: temporarily add `<span>HARDCODED ENGLISH</span>` to any file under `src/components/calendar/` and re-run — the test fails with `file:line: HARDCODED ENGLISH` listing. Revert when done.

### B. i18n duplicate-key guard still passes (B.PT90 + the new namespaces from B.PT91-93)

```bash
pnpm test:run src/lib/__tests__/i18n-no-duplicate-keys.test.ts
```

- [ ] 4 tests pass (no top-level namespace collisions in the merged en.json / es.json)

### C. Workflow optimism — type-check the new mutation hooks (B.PT96)

```bash
pnpm tsc --noEmit
```

- [ ] No errors. Specifically verifies `use-update-workflow.ts` + `use-delete-workflow.ts` use `inferRouterOutputs<AppRouter>["workflows"]["list"]` correctly.

### D. Full vitest — no regressions

```bash
pnpm test:run
```

- [ ] **413 passed / 0 failed / 2 skipped** if the dev:full server isn't holding `dev.db` lock.
- [ ] If you see "Operation has timed out" on `prisma.bookingAudit.deleteMany({})` — that's the known dev-server-lock issue (B.PT88). Stop `pnpm dev:full`, re-run.

### E. Lint

```bash
pnpm lint
```

- [ ] **0 errors** (7 pre-existing warnings in unrelated files).

### F. New audit doc readable

```bash
cat docs/optimistic-ui-audit.md | head -30
```

- [ ] Doc exists and lists all 35 mutation hooks categorized by optimism candidacy + 4-wave rollout plan. Reference for B.PT97/98/99 future work.

---

## Recap of what shipped

| ID | Surface | Net change |
|---|---|---|
| B.PT91 | `/h/<handle>` visitor booking | 47 keys in new `BookingCalendar` namespace; 7 calendar components localized |
| B.PT92 | `/login` + `/register` form sub-components | 32 keys added to existing `Auth` namespace; 3 form components localized |
| B.PT93 | `/profile` + `(host)/error.tsx` | 11 keys across new `Profile` + `HostError` namespaces; 3 files localized |
| B.PT94 | i18n coverage vitest contract | NEW `src/lib/__tests__/i18n-coverage.test.ts` (290 LOC) — fails CI on new hardcoded English in clean dirs |
| B.PT95 | Workspace switcher menu rows | CSS-only — visible disabled-state dim mid-async-op |
| B.PT96 | Optimistic UI rollout | NEW `docs/optimistic-ui-audit.md` (200+ LOC) + 2 reference impls (`use-update-workflow` + `use-delete-workflow`) using Tanstack canonical onMutate/setQueryData/onError pattern |

All 5 OPEN items from `docs/qa-pass-2026-05-03.md` are now FIXED or DEFERRED.
