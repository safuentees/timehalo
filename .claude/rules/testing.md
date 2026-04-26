---
paths:
  - "src/trpc/__tests__/**/*.ts"
  - "e2e/**/*.ts"
  - "vitest.config.ts"
  - "playwright.config.ts"
  - ".github/workflows/**/*.yml"
---

# Testing

Two suites, two layers, two purposes.

## Vitest — server-side contracts (`pnpm test:run`)

- Lives in `src/trpc/__tests__/*.test.ts`. ~3s for 45 tests; run before every commit that touches a procedure.
- Calls procedures via `appRouter.createCaller(ctx)` directly. NO HTTP, NO React Query, NO browser. The router exports `createCaller = t.createCallerFactory` — use it; `initTRPC.create()` from inside a test breaks the Context type chain.
- Uses the real `prisma/dev.db`. `vitest.config.ts` runs serially via `pool: "forks"` + `fileParallelism: false` so per-test DB wipes don't race.
- Shared fixtures in `test/fixtures.ts`: `createTestHost`, `tomorrowAt10UTC`, `wipeTransientState`, `fakeContext`. Per-test cleanup goes in `beforeEach`; per-file teardown in `afterAll`.
- `server-only` is shimmed via `test/server-only-shim.ts` so files like `src/lib/rate-limit.ts` that `import "server-only"` load in Node.
- `dotenv` is loaded via `test/vitest.setup.ts` so `DATABASE_URL` is in scope before the prisma singleton initializes.

## Playwright — hydration + flow smoke (`pnpm exec playwright test`)

- `e2e/hydration.spec.ts` (public routes) + `e2e/hydration-authed.spec.ts` (authed). Captures `console.error` + `pageerror` events, fails on anything matching `/hydrat|did not match|server.+rendered|server\/client/i`.
- Authed routes log in via the credentials form once per test. The test user is seeded in `e2e/global-setup.ts` via `pnpm exec tsx e2e/seed-test-user.ts` (Playwright's runtime can't import the generated Prisma client; tsx in a separate process can).
- Use `waitUntil: "load"` + a 1.5s buffer. NEVER `networkidle` — the live-queue SSE subscription holds a persistent connection forever and `networkidle` never fires.
- The login button selector is `getByRole("button", { name: "Sign in" })` (the page also has a "Continue with GitHub" submit button — don't use a generic `button[type=submit]`).

## CI (`.github/workflows/ci.yml`)

- Three jobs: `check` (lint + tsc), `unit` (vitest), `e2e` (Playwright). `unit` and `e2e` `needs: check`.
- Concurrency `cancel-in-progress` on `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` — fix-up commits cancel previous runs.
- `tsx` is a devDep (Playwright globalSetup needs it). `playwright install --with-deps` is required on ubuntu-latest.
- Branch protection (when active) requires all three: `lint + typecheck`, `vitest (server-side contracts)`, `playwright (hydration smoke)`.

## Adding tests

- **New tRPC procedure** → add a Vitest contract test. Pattern: caller + fakeContext + assert on return + Prisma row counts.
- **New page or layout** → add the route to `PUBLIC_ROUTES` or `AUTHED_ROUTES` in the hydration specs. Don't write a Vitest hydration test — Vitest can't run hydration.
- **Hydration mismatch in development** → add the offending route to the Playwright spec, watch it fail, fix it, watch it pass.

## What's intentionally NOT tested

- Item 4 (ICS) — output is a string the OS parses; no third-party validator.
- Item 5 (observability) — withSpan log format isn't a contract callers depend on.
- End-to-end SSE wire format — tRPC's responsibility, not ours. The bus contract is tested directly.
