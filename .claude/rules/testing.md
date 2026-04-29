---
paths:
  - "src/**/__tests__/**/*.ts"
  - "test/**/*.ts"
  - "e2e/**/*.ts"
  - "vitest.config.ts"
  - "playwright.config.ts"
  - ".github/workflows/**/*.yml"
---

# Testing

Two suites, two layers, two purposes. Both gate CI; both must stay green before any merge.

## Stack (verified 2026-04-29)

- **Vitest 4.1.5** — `pool: "forks"`, `fileParallelism: false`, `environment: "node"`. Path aliases come from `tsconfig.json` via `vite-tsconfig-paths`; `server-only` is shimmed at `test/server-only-shim.ts`.
- **Playwright 1.59.1** — Chromium-only, `fullyParallel: false`, **`workers: 1`** (see *Playwright workers* below). 3 projects: `setup` → `public` → `authed`.
- **@trpc/server 11.16.0** — every contract test calls `createCaller(appRouter)` from `src/trpc/router.ts` (which exports `t.createCallerFactory(appRouter)`).
- **Prisma 7.7.0** with `@prisma/adapter-libsql` against the real `prisma/dev.db`.

If any of those numbers change, update this file in the same PR.

---

## Vitest — server-side contracts (`pnpm test:run`)

Lives in `src/**/__tests__/**/*.test.ts`. ~6s tests / ~27s wall for 300+ cases. Run before every commit that touches a procedure or a primitive.

### Caller pattern (canonical)

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { createTestHost, fakeContext, tearDownTestHost, wipeTransientState } from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-<domain>";

describe("domain.procedure", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => { host = await createTestHost(HANDLE); });
  beforeEach(async () => { await wipeTransientState(host.id); });
  afterAll(async () => { await tearDownTestHost(host.id); });

  it("does the thing", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const result = await caller.domain.procedure({ ... });
    expect(result.X).toBe(...);
  });
});
```

- **NEVER** call `initTRPC.create()` from inside a test. Always go through `createCaller` exported by `src/trpc/router.ts` — it's already wired against the real `Context` type.
- **NEVER** roll your own context shape. Use `fakeContext()` from `test/fixtures.ts` — it provides a unique `ipIdentifier` per call so the rate limiter doesn't carry state across tests.

### Fixtures inventory (`test/fixtures.ts`)

| Helper | When to use |
|---|---|
| `createTestHost(handle)` | Default. Mints User + AvailabilityRange (every weekday 0:00–23:45) + Workspace + OWNER Membership in one transaction. The booking flow requires `host.ownedWorkspaces[0]`, so this is the right shape for any test that exercises `bookings.create` / `bookings.cancel` / etc. |
| `createTestUser(handle, opts?)` | Lightweight user — no availability, no workspace. ~10× faster than `createTestHost`. Use when the test needs a principal (admin, second host, viewer, invitee) that doesn't accept bookings. |
| `createTestBooking(opts)` | Insert a Booking row directly, bypassing tRPC validation + idempotency + webhook fan-out. Useful for cleanup-cron retention, audit inspection, listForHost ordering. |
| `createTestWebhookSubscription(opts)` | Insert a WebhookSubscription row with a deterministic secret so tests can verify HMAC. |
| `createTestBookingAudit(opts)` | Insert an audit row directly. `bookingUid` is a plain string (no FK), so this seeds orphan audits for the survives-deletion invariant. |
| `createTestEventTypeHostPool(opts)` | Mint an EventType + EventTypeHost rows on the host's primary workspace. Use for round-robin / multi-host tests. Defaults: `isFixed: false`, `priority: 2`, `weight: 1`, `recentAssignments: 0`. |
| `fakeContext(overrides?)` | Synthetic tRPC context. `userId` makes it authed; omit for anonymous visitor flow. |
| `wipeTransientState(hostId?)` | Per-test cleanup: bookings, audit, tasks, webhook subs, user features. Call in `beforeEach`. |
| `tearDownTestHost(hostId)` | Per-file teardown: `wipeTransientState` + `user.deleteMany` + `$disconnect`. Call in `afterAll`. |
| `safeTearDownByHandle(handle)` | Same as `tearDownTestHost`, but resilient to the host already being gone. Use when the test under test deletes the user (e.g. `users.deleteAccount`). |
| `purgeTestWorkspaces(slugs)` | Delete invitations + memberships + workspaces for the given slugs. Use in `beforeEach` for workspaces.* tests. |
| `upgradeWorkspaceToPro({ slug })` | Bump a workspace's plan to PRO. Required before `workspaces.invite` (gated by `hasFeature('PRO', 'workspaces.invite')`). |
| `tomorrowAt10UTC()` / `tomorrowAtMinute(offset)` | Future slot timestamps. Always upcoming — safe even if a test takes minutes. |

If you need a new fixture, add it next to its peers in `test/fixtures.ts`. The §10 "composable factories" comment block documents the rallly-derived shape.

### Env stubbing — `vi.stubEnv`, never `process.env.X = ...`

Direct `process.env` mutation leaks across tests if a test crashes mid-run. `vi.stubEnv` is the canonical Vitest 4 pattern.

```ts
import { vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("CRON_SECRET", "vitest-cron-secret");
});
afterAll(() => {
  vi.unstubAllEnvs();
});
```

To unset a var (e.g. test the "secret unset → 503" path), pass `undefined`:

```ts
vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined as unknown as string);
```

The `as unknown as string` cast is required because Vitest's TS signature still types the value as `string`, but the runtime supports `undefined` as the "delete" sentinel since 2.x.

**Exception — t3-env import-time snapshots.** `@/env` parses + caches at module load. `vi.stubEnv` doesn't reach the cached object. Use hoisted `vi.mock` for those:

```ts
vi.mock("@/env", async () => {
  const orig = await vi.importActual<typeof import("@/env")>("@/env");
  return {
    ...orig,
    env: { ...orig.env, GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id" },
  };
});
```

Reference: `src/trpc/__tests__/calendar-integration.test.ts`, `calendar-cron.test.ts`.

### Time mocking — `vi.useFakeTimers` + `vi.setSystemTime`

For tests whose correctness depends on `Date.now()` (DST math, scheduled tasks, expirations), pin the system clock:

```ts
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-08T07:00:00Z")); // US DST cusp
});
afterAll(() => {
  vi.useRealTimers();
});
```

When the implementation uses an explicit `from` arg (current state of `generateUpcomingSlots`), the pin is belt-and-braces — but write the pin anyway so a future refactor that accidentally references `Date.now()` fails here, not on a passing dev box on some other day.

### Outbound network — `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals` afterEach

```ts
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
```

Three callers today (`webhook-cron.test.ts`, `calendar-integration.test.ts`, `calendar-cron.test.ts`). When a fourth lands AND the shapes diverge meaningfully, revisit MSW. Until then, `vi.stubGlobal` is fine.

### Spying on Prisma — `vi.spyOn(prisma, "$queryRaw")`

Pattern for testing degraded paths (DB outage, etc.):

```ts
const spy = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("simulated db outage"));
try {
  const res = await readyGet();
  expect(res.status).toBe(503);
} finally {
  spy.mockRestore();
}
```

`mockRejectedValueOnce` (not `mockRejectedValue`) so subsequent tests in the same file see the real adapter. Always restore in `finally`.

### File-naming conventions

- One test file per logical concern, not per source module.
- For domains with >300 lines or >20 cases (e.g. `workspaces`), split by sub-concern: `workspaces-scopes.test.ts` (pure unit), `workspaces-lifecycle.test.ts` (CRUD), `workspaces-invitations.test.ts` (invite/accept/preview). Each split file uses its OWN `SLUG` constant (`vitest-workspace-lifecycle`, `vitest-workspace-invitations`) so cross-file teardown order stays unambiguous.
- File name = the procedure-domain + concern: `bookings-create.test.ts`, `bookings-cancel.test.ts`, `bookings-reschedule.test.ts`, `cleanup-bookings-cron.test.ts`. Don't name files by the source file (`use-foo-hook.test.ts`); name by the contract being tested.

### Why real DB, not mocks

`pool: "forks"` + `fileParallelism: false` serializes test FILES so per-test DB wipes can't race. This costs ~3s of overhead vs. mocked Prisma but pays off:

- The 3-concurrent-submit test in `bookings-create.test.ts` actually exercises SQLite's serialization guarantees and caught a real race condition (commit `c2fe653`). A mocked Prisma client would have lied.
- Mocked repository contracts drift silently when source signatures change. Real-DB tests fail loudly on schema mismatches.

This is the project's identity (small surface, deep stack) materialized in tests. **DO NOT enable `fileParallelism: true` without first moving to a per-file DB.**

---

## Playwright — hydration + flow smoke (`pnpm exec playwright test`)

Two layers, three projects.

### Project topology (`playwright.config.ts`)

```
setup    (e2e/auth.setup.ts)         — logs in once, persists playwright/.auth/user.json
  ↓
public   (hydration.spec.ts +        — anonymous visitor; storageState: empty
          booking-flow.spec.ts)
authed   (hydration-authed.spec.ts)  — depends on setup; storageState: user.json
```

Adding a new authed flow spec? Match the `authed` project's `testMatch` regex. Adding a new public spec? Match the `public` project's regex.

### Playwright workers — **always 1**

`workers: 1` is set at config root. **Do not raise it.** With ≥2 workers, the dev server compiles routes on demand and base-ui's `useId` snapshots can diverge between SSR and CSR — surfacing as a phantom hydration mismatch on `/login` when a different worker has just compiled `/h/<host>`. The trade-off (~2s slower runs) is documented in the config.

### Auth caching via `storageState`

Authed specs DO NOT log in inline. They inherit cached cookies from `setup`. To add a new authed spec:

```ts
// e2e/<name>.spec.ts
import { test, expect } from "@playwright/test";

test("authed flow X", async ({ page }) => {
  // page is already logged in as the test user
  await page.goto("/some-authed-route");
  // ...
});
```

The setup project saves cookies via `page.context().storageState({ path: "playwright/.auth/user.json" })`. If you change the credentials form's selectors, update `e2e/auth.setup.ts` to match — the credentials inputs use `name="email"` / `name="password"` (the magic-link form has `type="email"` too, so disambiguate by `name`).

### Anonymous specs

Public specs use empty `storageState` set per-spec to keep visitor truly anonymous:

```ts
// playwright.config.ts (already configured)
{
  name: "public",
  storageState: { cookies: [], origins: [] },
}
```

For the booking flow, this prevents any prior session bleed.

### Test constants live in `e2e/test-constants.ts`

```ts
export const TEST_EMAIL = "hydration-e2e@test.local";
export const TEST_PASSWORD = "test-password-hydration-1234";
export const TEST_HANDLE = "hydration-e2e";
```

Reference these from specs and the seed script — never hardcode handles like `/h/turbius` in spec files. If the seed user is wiped, the specs must fail loudly via the constant, not silently via a stale literal.

### Seed requirements (`e2e/seed-test-user.ts`)

The seed script runs once in `globalSetup`. Three things it MUST do, in order:

1. **Wipe transient rows by host first** (`Booking`, `BookingAudit`, `Task`). `@prisma/adapter-libsql` doesn't always honor SQLite FK cascades reliably — explicit `deleteMany` is the only reliable cleanup.
2. **Wipe the workspace by slug**, then the user. Same reason: cascade may not propagate. The workspace slug pattern is `${TEST_HANDLE}-personal`.
3. **Recreate the user + AvailabilityRange + Workspace + OWNER Membership.** The Workspace + Membership pair is REQUIRED — `bookings.create` resolves `Booking.workspaceId` from `host.ownedWorkspaces[0]` (B1 invariant). Without it, every booking call fails with `"Host has no workspace"`.

This shape mirrors `bootstrapUserWorkspace` in `src/lib/auth-events.ts`. If you change that bootstrap, change the seed in the same PR.

### Spec patterns

- `waitUntil: "load"` + a 1.5s buffer. **NEVER `networkidle`** — the live-queue SSE subscription holds a persistent connection forever and `networkidle` never fires.
- Login button: `getByRole("button", { name: "Sign in" })`. The page also has a "Continue with GitHub" submit button — don't use a generic `button[type=submit]`.
- For booking flow, use accessible names from the actual UI:
  - `getByRole("button", { name: "Pick a date" })` — the trigger card before any selection
  - `locator('button[aria-label*="open slots"]').first()` — day-strip / day buttons
  - `locator('button[aria-label^="Book "]').first()` — slot chip buttons
  - `getByRole("button", { name: /Confirm booking/i })` — booking form submit
- Confirmation page assertions: use the `Add to calendar` / `Reschedule` link names. **Don't assert the visitor email** — the confirmation page doesn't render it (only host name, slot, share/calendar/reschedule affordances).

### Hydration error pattern

The hydration spec watches for console messages matching:

```
/hydrat|did not match|server.+rendered|server\/client/i
```

If you see this in dev, add the offending route to `PUBLIC_ROUTES` (`hydration.spec.ts`) or `AUTHED_ROUTES` (`hydration-authed.spec.ts`), watch it fail, fix it, watch it pass. Don't write Vitest hydration tests — Vitest can't run hydration.

---

## CI (`.github/workflows/ci.yml`)

Three jobs: `check` (lint + tsc), `unit` (vitest), `e2e` (Playwright). `unit` and `e2e` `needs: check`. Concurrency `cancel-in-progress` on `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` — fix-up commits cancel previous runs.

`tsx` is a devDep (Playwright globalSetup needs it). `playwright install --with-deps` is required on ubuntu-latest.

Branch protection (when active) requires all three: `lint + typecheck`, `vitest (server-side contracts)`, `playwright (hydration smoke)`.

---

## Adding tests — decision matrix

| Change you're making | Test to add |
|---|---|
| New tRPC procedure | Vitest contract test in `src/trpc/__tests__/`. Pattern: caller + fakeContext + assert on return + Prisma row counts. |
| New page or layout | Add the route to `PUBLIC_ROUTES` (`hydration.spec.ts`) or `AUTHED_ROUTES` (`hydration-authed.spec.ts`). |
| New visitor flow (booking, reschedule, etc.) | Extend `e2e/booking-flow.spec.ts` or add a sibling `e2e/<flow>-flow.spec.ts` in the `public` project. |
| New §10.1 production primitive | Vitest contract test asserting the invariant directly. Match the existing primitive tests' shape (`rate-limit.test.ts`, `attribution.test.ts`, `feature-flags.test.ts`). |
| Schema change | Update fixtures + run the suite. If a test fails because the schema's invariant changed, update the test's assertion, not the schema. If the schema's contract changed, update both. |
| New env var | If the test needs to override it: `vi.stubEnv` + `vi.unstubAllEnvs()`. Never `process.env.X = ...`. |
| New outbound integration | `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` afterEach. Keep the shape identical to the existing 3 callers; revisit MSW only when shapes diverge. |
| Removing a feature | Delete the test files; don't leave skipped tests as documentation. The audit (`OFFICEHOURS-TEST-AUDIT.md`) tracks what's intentionally NOT tested. |

---

## Don't

- ❌ Don't call `initTRPC.create()` inside a test — breaks the Context type chain.
- ❌ Don't roll your own context object — use `fakeContext()`.
- ❌ Don't mutate `process.env` directly — use `vi.stubEnv`.
- ❌ Don't use `networkidle` in Playwright — SSE subscriptions never settle.
- ❌ Don't hardcode the test handle / email / password in specs — import from `e2e/test-constants.ts`.
- ❌ Don't skip the seed script's workspace + Membership creation — `bookings.create` will fail with `"Host has no workspace"`.
- ❌ Don't enable `fileParallelism: true` (Vitest) or raise `workers` (Playwright) without first re-architecting around the dev-server compilation race + the shared dev.db.
- ❌ Don't add tests for unimplemented features — test them when they ship. The §10.1 list in `OFFICEHOURS-PROJECT-GUIDE.md` is the canonical "what next."
- ❌ Don't add tests for things `OFFICEHOURS-TEST-AUDIT.md` §4 says are intentionally untested (ICS output, withSpan log format, SSE wire format).

---

## What's intentionally NOT tested

- §10.1 #4 ICS export — output is a string the OS parses; no third-party validator worth running in CI.
- §10.1 #5 observability `withSpan` — the log format isn't a contract callers depend on.
- End-to-end SSE wire format — that's tRPC's responsibility. The bus contract is tested directly (`bus.test.ts`).
- The visitor email on the confirmation page — the page doesn't render it.

If you think one of these should be tested, document the new requirement in `OFFICEHOURS-FOLLOWUPS.md` first; this doc is the source of truth for the existing decision.

---

## Pre-commit checklist (procedure or primitive change)

1. `pnpm test:run` — Vitest, all 300+ cases, ~6s tests.
2. `pnpm exec playwright test` — full e2e, ~15s.
3. `pnpm tsc --noEmit` — clean.
4. `pnpm lint` — 0 errors.

If you're touching the booking flow, the webhook flow, or any §10.1 primitive: also re-read `.claude/rules/production-primitives.md`. The tests are the contract; that doc is the contract's intent.
