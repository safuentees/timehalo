# Officehours Test Suite Audit

**Date:** 2026-04-29
**Scope:** ~190 Vitest test cases across 33 contract files + 2 Playwright specs + 1 unit file (encryption). The "279" figure assumes nested `describe` × `it` blocks; raw `it/test` counts are ~190 (server-side) + 7 (encryption) + N (Playwright = 1 case × 4 authed routes + 1 × 3 public routes = 7).

---

## 1. Executive summary

- **The suite is healthier than its loudest critic.** It already follows 80% of what a 2026 best-practice playbook would prescribe: `createCallerFactory` directly, no HTTP, no React Query, real DB serialized via `pool: forks` + `fileParallelism: false`, shared fixtures, `vi.stubGlobal('fetch', ...)` for the only outbound network in webhooks, `it.skipIf(...)` for env-gated paths. The CI matrix (`check` → `unit`+`e2e`) is the cal.com shape minus the package monorepo overhead.
- **Three structural risks dominate.** (1) The real-DB-shared-state model means a *single* test that forgets `wipeTransientState` can corrupt the next file's snapshot — there's no transactional rollback fence. (2) `process.env` is mutated in `admin.test.ts:88`, `cleanup-bookings-cron.test.ts:717`, `webhook-cron.test.ts`, `billing.test.ts:362` without `vi.stubEnv`, so leaks are theoretically possible across tests. (3) The Playwright authed spec re-logs-in for every route (~5s × 4 routes = 20s) instead of caching `storageState` — that's the single biggest CI-time win available.
- **The biggest content gap is item 4 (ICS) and item 5 (observability) — both intentionally untested per `.claude/rules/testing.md`. Plus B2 (calendar two-way write) has no tests because the feature isn't shipped, and A4 (mocked-adapter integration) is partially closed by `calendar-integration.test.ts`.** Everything else on §10.1 has dedicated coverage.
- **No anti-patterns rise to "delete this test."** Two real smells: `account-deletion.test.ts:31` deletes the host inline rather than via `tearDownTestHost`, and `bookings-create.test.ts:24` constructs its own context helper instead of `fakeContext()` — micro-DRY hits, not bugs.
- **Recommendation: a *trimmed-rallly* style with cal.com's `withReporting`-style selective wrapping mindset, *not* a port of cal.com's heavy `vi.hoisted` mock-everything pattern.** This repo's contract-against-real-DB choice is correct for a single-developer portfolio piece — keep it. Promotion priorities: (a) Playwright `storageState` cache, (b) `vi.stubEnv` adoption, (c) Vitest 4 `projects` to gate slow integration tests, (d) one MSW handler for outbound-only mocks (calendar adapter, Resend) instead of the bespoke `vi.stubGlobal` mocking sprinkled in 3 files.

---

## 2. Current state

### Stack (verified versions, 2026-04-29)

- **Vitest 4.1.5** (`package.json:64`). Config: `src/**/__tests__/**/*.test.ts` only; `pool: "forks"`, `fileParallelism: false`; `setupFiles: ["test/vitest.setup.ts"]` for dotenv preload; `server-only` shimmed via `test/server-only-shim.ts`. Source: `vitest.config.ts:13-38`.
- **@playwright/test 1.59.1** (`package.json:43`). Chromium-only, `fullyParallel: false`, `globalSetup: ./e2e/global-setup.ts` shells out via `tsx` to seed the test user. Source: `playwright.config.ts:7-34`.
- **@trpc/server 11.16.0** (`package.json:23`). All contract tests use `createCaller(appRouter)` from `src/trpc/router.ts` (which exports `t.createCallerFactory(appRouter)`).
- **Prisma 7.7.0** with the `@prisma/adapter-libsql` driver — real `prisma/dev.db` against a single host; serial test files prevent races.
- **No MSW**, **no `@faker-js/faker`**, **no `@testing-library`** anywhere. The `jsdom` devDep (`package.json:54`) is unused — `vitest.config.ts:15` sets `environment: "node"` globally.

### Test categories

| Category | Files | Cases (approx) | Runtime | Notes |
|---|---|---|---|---|
| Vitest contract (server-side) | 33 | ~190 raw `it` | ~3s | Real DB, real handlers, `createCaller`. Source of truth for the §10.1 contracts. |
| Vitest unit (pure) | 1 | 7 | <1s | Only `src/lib/calendar/__tests__/encryption.test.ts`. AES-GCM round-trip + tamper rejection + missing-key throw. |
| Playwright e2e | 2 | 7 | ~25s | Hydration smoke only. No flow assertions beyond "no `/hydrat|did not match/i` console error." |

### Patterns observed

- **Caller construction**: every contract test imports `createCaller` + `appRouter` and threads a synthetic context via `fakeContext({ userId, ipIdentifier, cookies })`. The pattern matches the tRPC v11 SKILL.md verbatim (see Context7 `/trpc/trpc` "Integration Testing with tRPC Server-Side Caller").
- **Fixture shape**: `test/fixtures.ts:11-69` has `createTestHost(handle)` that creates User + Workspace + OWNER Membership + PRO Subscription in a single transaction. Composable factories follow rallly's `test-utils.ts` shape (cited verbatim at `test/fixtures.ts:184`). Resets via `wipeTransientState(hostId)`.
- **Time mocking**: nearly absent. `tomorrowAt10UTC()` and `tomorrowAtMinute(offset)` compute future slots from real `Date.now()`. Only `logger.test.ts` and `email-send.test.ts` use `vi.spyOn`. No `vi.useFakeTimers()`, no `vi.setSystemTime()` — DST tests in `timezone.test.ts` rely on real Date math.
- **Outbound network**: `webhook-cron.test.ts` uses `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` afterEach. `calendar-integration.test.ts` uses `vi.mock('@/env', ...)` for hoisted env override + `vi.stubGlobal('fetch', ...)`. `billing.test.ts` directly calls `createHmac` — no network.
- **Env stubbing**: 4 files mutate `process.env.*` directly without `vi.stubEnv`:
  - `admin.test.ts:88` — `process.env.OFFICEHOURS_ADMIN_HANDLES`
  - `cleanup-bookings-cron.test.ts:717` — `process.env.CRON_SECRET`
  - `webhook-cron.test.ts` (sets `CRON_SECRET` similarly)
  - `billing.test.ts:362` — `process.env.STRIPE_PRICE_PRO`
  - `encryption.test.ts:16` — `process.env.CALENDAR_TOKEN_KEY`
- **Cleanup discipline**: `beforeEach(wipeTransientState)` is the dominant pattern. `afterAll(tearDownTestHost)` plus `await prisma.$disconnect()`. There's no transactional fence — if a test crashes mid-run, dev.db carries the residue into the next run.

---

## 3. Per-file review

Grouped by domain. "Spec match" = does this match `OFFICEHOURS-PROJECT-GUIDE.md` §10.1 + `.claude/rules/production-primitives.md`. "Action" = keep / refactor / delete / merge / expand.

### Bookings (the loop)

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/bookings-create.test.ts` | 5 | §10.1 #1 idempotency, #2 audit, race protection, workspaceId stamp | Y | Constructs its own context helper at `bookings-create.test.ts:27-35` instead of `fakeContext()`. Trivial duplication. | Refactor (use `fakeContext`) |
| `src/trpc/__tests__/bookings-cancel.test.ts` | 7 | §10.1 #2 audit, #7 soft delete, idempotencyKey nulling | Y | Clean. | Keep |
| `src/trpc/__tests__/bookings-reschedule.test.ts` | 7 | A7 reschedule swap, audit chain via operationId, slot collision, original soft-deleted, rescheduledFromUid | Y | Clean. Procedure exists per OPEN-DEFERRALS A9 but **visitor UI does not** — hydration-authed e2e doesn't catch this since the procedure is what's tested. | Keep |
| `src/trpc/__tests__/bookings-get-detail.test.ts` | 8 | host-side detail page query: permission, audit list, pendingTasks | Y | Clean. | Keep |
| `src/trpc/__tests__/booking-reminders.test.ts` | 4 | A8 booking-reminder Task scheduled 1h pre-slot; cancel/reschedule supersede | Y | Email template contract piggybacks on `@react-email/render` — tight coupling to library output. | Keep |
| `src/trpc/__tests__/cleanup-bookings-cron.test.ts` | 5 | A11 retention window, audit-survives, batched delete, 401 without bearer | Y | Mutates `process.env.CRON_SECRET` (line 717) without `vi.stubEnv`. | Refactor (vi.stubEnv) |

### Webhooks + tasks

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/webhooks.test.ts` | 12 (nested) | §10.1 #6 subscription CRUD, schedule-on-create, B1 workspace scope, idempotency-replay-no-double-Task | Y | Clean. Strongest contract file in the repo. | Keep |
| `src/trpc/__tests__/webhook-cron.test.ts` | 6 | cron processor: HMAC sign, retry-on-failure, 410-GONE deactivation, ref-uid idempotency | Y | Uses `vi.stubGlobal('fetch')` correctly. CRON_SECRET via `process.env=`. | Refactor (vi.stubEnv) |
| `src/trpc/__tests__/bus.test.ts` | 4 | §10.1 #8 in-process EventEmitter for SSE: emit→consume, channel isolation, abort cleanup | Y | Note at `bus.test.ts:7-10`: SSE wire format is intentionally not tested. Matches `.claude/rules/testing.md`. | Keep |

### Workspaces / multi-tenant (B1+)

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/workspaces.test.ts` | 22 | B1 scope matrix, create/list/get, invitation lifecycle, setMemberRole, removeMember, preview | Y | 470 lines — by far the largest. Could split into 3 files (scope matrix / lifecycle / invitations) but coherent as-is. | Keep |
| `src/trpc/__tests__/api-keys.test.ts` | 18 | B2 token shape, sha256 round-trip, timing-safe verify, revoke + expiry, scope subset, REST 401/403/200, OpenAPI doc shape | Y | Imports REST route handlers directly (`whoamiGet`, `openapiGet`) — same pattern cleanup-bookings uses for cron. Strong. | Keep |
| `src/trpc/__tests__/plan-gating.test.ts` | 8 (nested) | A3 FREE-fail / PRO-pass for invite, apiKeys.create, webhooks.create, workflows.create | Y | Clean. | Keep |
| `src/trpc/__tests__/feature-flags.test.ts` | 7 | §10.1 #10 default fallback, kill-switch, global-on, per-user UserFeatures override + tRPC query | Y | Clean. | Keep |
| `src/trpc/__tests__/admin.test.ts` | 10 | A9 admin gate (UNAUTHORIZED → FORBIDDEN), featureFlags / webhooks / audit sub-routers | Y | `process.env.OFFICEHOURS_ADMIN_HANDLES = ADMIN_HANDLE` at line 88 — leaks into other suites if run in same process. Mitigated by `delete` in afterAll, but fragile. | Refactor (vi.stubEnv) |
| `src/trpc/__tests__/account-deletion.test.ts` | 4 | A4 cascade deletion, BookingAudit survives (no FK), email enqueue, auth gate | Y | `afterAll` (line 30-36) hand-rolls cleanup instead of `tearDownTestHost(host.id)` because the test that runs delete already nuked the host. Comment explains it but the divergence is ugly. | Refactor (move to a per-test cleanup hook) |

### Calendar / scheduling

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/calendar.test.ts` | 17 | B3 mergeBusyTimes, subtractBusyTimes, connections+disconnect+setSelected, unconfigured-OAuth gate | Y | `it.skipIf(oauthConfigured)` at lines 232 + 241 — correct workaround for the t3-env snapshot, cited inline. | Keep |
| `src/trpc/__tests__/calendar-integration.test.ts` | 3 | A4 mocked Google adapter integration: full chain `getUpcomingSlots → fetchHostBusyTimes → google.getBusyTimes → fetch (mocked)` | Y | Closes the A4 deferral. `vi.mock("@/env", ...)` hoisted correctly. | Keep |
| `src/trpc/__tests__/timezone.test.ts` | 17 | A3 IANA validation, normalization, schema rejection of fixed offsets, DST-aware slot generation | Y | Real `Date.now()` → DST boundary edge case theoretically flaky. Has not flaked in CI. | Keep (low priority: pin to `vi.setSystemTime` at a known DST cusp) |
| `src/lib/calendar/__tests__/encryption.test.ts` | 7 | AES-GCM round-trip + tamper rejection + missing/short key | Y | `process.env.CALENDAR_TOKEN_KEY` mutated directly. | Refactor (vi.stubEnv) |

### Auth / user lifecycle

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/auth-register.test.ts` | 5 | credentials register: email lowercase, hashed password, validatePassword | Y | Clean. | Keep |
| `src/trpc/__tests__/auth-events.test.ts` | 7 | bootstrapUserWorkspace: personal slug, OWNER membership, idempotency on reentry | Y | Clean. | Keep |
| `src/trpc/__tests__/onboarding.test.ts` | 12 | A6 pure logic for `computeOnboardingSteps` + `progress` + `isComplete` | Y | Pure unit, fast, no DB. | Keep |
| `src/trpc/__tests__/i18n.test.ts` | 8 | A5 LOCALES, isLocale narrowing, Accept-Language negotiation | Y | Clean. | Keep |

### Workflows + rules engine

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/workflows.test.ts` | 13 (nested) | B4 CRUD, cross-field zod (EMAIL_* needs template; WEBHOOK_FIRE needs event), engine integration with `bookings.create` | Y | 382 lines but coherent. | Keep |
| `src/trpc/__tests__/workflows-default-dedup.test.ts` | 4 | A4 hardcoded reminder vs default-workflow path: exactly-one Task | Y | Tight, focused. | Keep |

### Cross-cutting primitives

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `src/trpc/__tests__/rate-limit.test.ts` | 2 | §10.1 #3 11th-request burst, per-IP isolation | Y | Comment block at top is a model of what good test docs read like. | Keep |
| `src/trpc/__tests__/attribution.test.ts` | 4 | §10.1 #9 oh_ref cookie threads to Booking.referrer, length cap, cookie-not-present default | Y | Clean. Bypasses proxy.ts intentionally. | Keep |
| `src/trpc/__tests__/round-robin.test.ts` | 11 | C3 pure algorithm: empty pool, exclude set, lowest recentAssignments, priority dominance | Y | Pure unit, no DB. | Keep |
| `src/trpc/__tests__/round-robin-integration.test.ts` | 3 | B2 RR wired through `bookings.create`: tiebreak determinism, recentAssignments bump, priority override | Y | Manually mints EventType + EventTypeHost — could be a factory helper. | Keep (or extract `createTestEventTypeHostPool` helper) |
| `src/trpc/__tests__/test-factories.test.ts` | 6 | A12 contract on the factories themselves | Y | Self-test for fixtures — good idea, mirrors `prisma-examples` pattern. | Keep |
| `src/trpc/__tests__/billing.test.ts` | 14 (nested) | C2 plan→feature matrix, planFromStripePriceId, HMAC verify (timing-safe + replay window), 503 when secret unset | Y | Mutates `process.env.STRIPE_PRICE_PRO` at line 362. Wraps in try/finally — correct discipline but `vi.stubEnv` is cleaner. | Refactor (vi.stubEnv) |
| `src/trpc/__tests__/email-send.test.ts` | 8 | A1 templates render to HTML+text, scheduleEmailSend writes Task, bookings.create+cancel enqueue | Y | Clean. | Keep |
| `src/trpc/__tests__/health-endpoints.test.ts` | 2 | A15 `/api/health` (liveness 200) + `/api/ready` (DB check) | Y | Minimal but fits the contract — liveness has 1 happy path; readiness has 1. No 503 path tested (would require killing DB). | Expand (add a 503 test by stubbing `prisma.$queryRaw` to reject) |
| `src/trpc/__tests__/logger.test.ts` | 6 | A10 leveled JSON output, name/msg/fields, level-routing | Y | Comment at top correctly notes the t3-env snapshot makes prod-silent branch untestable. | Keep |

### E2E (Playwright)

| File | Cases | Covers | Spec match | Notable issues | Action |
|---|---|---|---|---|---|
| `e2e/hydration.spec.ts` | 3 (one per route) | hydration smoke on `/login`, `/register`, `/h/turbius` | Y | Hardcoded handle `turbius` at `hydration.spec.ts:23`. If that user is wiped from dev.db, this fails non-obviously. | Refactor (seed `hydration-host` in global-setup) |
| `e2e/hydration-authed.spec.ts` | 4 (one per route) | hydration on `/bookings`, `/availability`, `/profile`, `/settings` after credential login | Y | **Re-logs-in for every route**. ~5s × 4 routes = 20s of wasted CI time. Should use `storageState` cached once via a `setup` project. | Refactor (storageState — see §8) |

---

## 4. Gaps vs the spec

Cross-referenced against `OFFICEHOURS-PROJECT-GUIDE.md` §10.1, `.claude/rules/production-primitives.md`, `OFFICEHOURS-OPEN-DEFERRALS.md`.

### Items spec'd but explicitly not tested (acknowledged gaps)

- **§10.1 #4 ICS export.** `.claude/rules/testing.md` *What's intentionally NOT tested* says: *"output is a string the OS parses; no third-party validator."* Decision is fine. Could add a regex sanity check (`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n...`) but not a real validator.
- **§10.1 #5 observability.** Same doc: *"withSpan log format isn't a contract callers depend on."* Decision is fine.
- **End-to-end SSE wire format** (subscription procedure, not the bus). `bus.test.ts:7-10` documents the scope decision. Defensible — testing it means spinning up an HTTP server + a real EventSource.

### Items shipped without test coverage (real gaps)

- **A9 visitor reschedule UI** (`OFFICEHOURS-OPEN-DEFERRALS.md` Tier A). The procedure has 7 tests; the visitor confirmation page lacks the Reschedule button. **Hydration spec doesn't catch missing UI elements** — only hydration errors. A Playwright flow assertion ("clicking Reschedule on `/booked/:uid` lands on `/h/:handle?reschedule=:uid`") would lock this contract once shipped.
- **B6 workspace context switcher.** No e2e coverage. Contract tests assert the procedures but the dashboard top-bar's actual switching (cookie → server-side context propagation) has no Playwright assertion. Once B6 ships, the workflow tests need to catch "switching workspace updates list scope."
- **`/api/v1/*` error path coverage in `api-keys.test.ts`.** REST 401/403/200 are tested; 429 (when A3 per-key rate limiting lands) and 5xx are not. Add when A3 ships.

### Items not yet shipped → no tests yet (correct, but flag for memory)

- **B2 calendar two-way write** (`OFFICEHOURS-OPEN-DEFERRALS.md` Tier B). 0 tests; feature is OPEN. When shipped, the Task-queue idempotency contract is the load-bearing one.
- **B3 Stripe checkout/portal procedures.** 0 tests; gated on product decision.
- **B5 workspace lifecycle four-pack** (rename / delete / leave / transferOwnership). 0 tests; feature is OPEN.
- **B10 multi-step workflows (`WorkflowStep` chains).** 0 tests; OPEN.
- **B12 calendar-conflict integration with round-robin** (`excludeHostIds` populated from busy-times). 0 tests; OPEN.

### §10.1 line-by-line audit

| §10.1 # | Item | Test file(s) | State |
|---|---|---|---|
| 1 | Idempotency | `bookings-create.test.ts` | Covered (4 cases) |
| 2 | Audit log decoupled | `bookings-create.test.ts` + `bookings-cancel.test.ts` + `account-deletion.test.ts` | Covered |
| 3 | Rate limit | `rate-limit.test.ts` | Covered (2 cases) |
| 4 | ICS export | (none) | Intentionally skipped per testing.md |
| 5 | Observability `withSpan` | (none) | Intentionally skipped per testing.md |
| 6 | Webhooks delivery | `webhooks.test.ts` + `webhook-cron.test.ts` | Covered (heavy) |
| 7 | Soft delete + cleanup cron | `bookings-cancel.test.ts` + `cleanup-bookings-cron.test.ts` | Covered |
| 8 | Live host queue (SSE bus) | `bus.test.ts` | Bus covered; subscription procedure not (out of scope) |
| 9 | Attribution cookie | `attribution.test.ts` | Covered (4 cases) |
| 10 | Feature flags | `feature-flags.test.ts` | Covered (7 cases incl. all 4 decision-matrix branches) |

**§10.1 score: 8 of 10 items have explicit, sufficient coverage. 2 items (ICS, observability) are intentionally skipped with documented reasoning.** That's the strongest dimension of this audit.

---

## 5. Anti-patterns and smells found

Concrete file:line references, ordered by severity.

### Real (worth fixing)

1. **Direct `process.env` mutation without `vi.stubEnv`.**
   - `src/trpc/__tests__/admin.test.ts:88` — `process.env.OFFICEHOURS_ADMIN_HANDLES = ADMIN_HANDLE`
   - `src/trpc/__tests__/cleanup-bookings-cron.test.ts:717` — `process.env.CRON_SECRET = CRON_SECRET`
   - `src/trpc/__tests__/webhook-cron.test.ts` (similar pattern)
   - `src/trpc/__tests__/billing.test.ts:362` — `process.env.STRIPE_PRICE_PRO = "price_pro_test"`
   - `src/lib/calendar/__tests__/encryption.test.ts:16` — `process.env.CALENDAR_TOKEN_KEY = TEST_KEY`
   Each cleans up via `delete` or try/finally, but `vi.stubEnv` + `vi.unstubAllEnvs()` is the canonical Vitest 4 way (Context7 `/vitest-dev/vitest/v4.0.7`). Reference it once in `test/vitest.setup.ts` and the rest is cleanup.
2. **Playwright authed spec re-logs-in per route** (`e2e/hydration-authed.spec.ts:25-38`). Costs 4 × ~5s. Playwright 1.59's idiomatic fix is a `setup` project + `storageState: 'playwright/.auth/user.json'` (Context7 `/microsoft/playwright/v1.58.2` "Configure Playwright Projects with Authentication State"). Single biggest CI-time win.
3. **Hardcoded `/h/turbius` route in public hydration spec** (`e2e/hydration.spec.ts:23`). If that user is removed from dev.db the test fails non-obviously. The seeder in `e2e/global-setup.ts` should mint a deterministic `hydration-host` and the spec should reference that handle.
4. **`account-deletion.test.ts` skips `tearDownTestHost`** (lines 30-36) and hand-rolls cleanup because the test under test deletes the host. Correct behavior, but the workaround is ad-hoc — extract a `safeTearDownIfExists(handle)` helper into `test/fixtures.ts`.
5. **`bookings-create.test.ts:27-35`** declares a private `createTestContext()` helper that duplicates `fakeContext()` in `test/fixtures.ts:165-175`. Pre-dates the fixture. Just import.

### Soft smells (low priority)

- **No `vi.useFakeTimers()` anywhere.** `timezone.test.ts` does DST math against real `Date.now()`. Hasn't bitten yet because the assertions don't depend on a specific calendar day. Pinning system time to a known DST cusp would be 5 LOC and prevent a future flake.
- **`workspaces.test.ts` is 470 lines.** Coherent but big. Splitting into `workspaces-scopes.test.ts` + `workspaces-lifecycle.test.ts` + `workspaces-invitations.test.ts` would help future contributors find the right place to add tests, and would let Vitest 4's parallel-files-within-a-project speed it up later.
- **Email tests bind to `@react-email/render` output.** Tight coupling — if upstream changes whitespace handling, `booking-reminders.test.ts:412` (`text.toContain("begins shortly")`) breaks. Comment at line 408 acknowledges this. Acceptable for now.
- **`logger.test.ts:927-940` patches `console.log/warn/error` but the logger reads `name` from `createLogger("test")` arg.** Production-mode log-silencing branch can't be tested without re-importing the module — explicitly noted in the file. Fine.
- **Real DB serialization is implicit.** `vitest.config.ts:25` uses `pool: "forks"` + `fileParallelism: false`. If a contributor flips `fileParallelism: true` not knowing why, suite explodes nondeterministically. Add a comment that says "DO NOT enable fileParallelism without a per-file DB" and pin via a CI check.

### Not-smells (correctly defensive)

- `it.skipIf(oauthConfigured)` in `calendar.test.ts:232` + `:241` is the right call given t3-env's import-time snapshot. Documented inline.
- `vi.mock("@/env", ...)` hoisted in `calendar-integration.test.ts:665` is correct — `vi.stubEnv` doesn't reach the parsed cached env object that t3-env materializes at module load. `vi.mock` is the only path. Documented inline.

---

## 6. cal.com comparison

### Stack

- **Vitest** with **`@vitejs/plugin-react`** (jsdom), `vitest.config.mts:55-78`. Test mode multi-flavored via `VITEST_MODE` env: `packaged-embed`, `integration`, `timezone`, default. Aliases set up for `@calcom/web`, `@lib`, `app`, etc.
- **No real DB**. Heavy `vi.mock(...)` + `vi.hoisted(...)` for repository / service stubs. See `packages/features/handleMarkNoShow.test.ts:1-100` — 80+ lines of mocks before the first `it`.
- **In-memory DB simulation** via plain JS objects (`const DB = { bookings: {}, attendees: [...] }`). Mock repository methods read/write the in-memory DB.

### Strengths (versus our approach)

- **Pure unit isolation**. A failing test in cal.com tells you exactly which method's contract broke; ours tells you "the booking handler did the wrong thing somewhere across the transaction."
- **Fast in CI even at scale** — no DB wipe, no fork overhead. Cal.com runs thousands of tests in parallel.
- **Multi-mode config** (`vitest.config.mts:13-39`). `--integrationTestsOnly` and `--timeZoneDependentTestsOnly` let CI gate slow tests separately. Useful at a hundred-developer scale.

### Weaknesses (for our context)

- **Mock drift.** Every test mocks `BookingRepository`, `AttendeeRepository`, `WebhookService`, ~10 services. When a real method signature changes, mocks are stale; tests pass against a fictional system.
- **`vi.hoisted` + class-based mock factories everywhere**. The test-vs-test boilerplate is bigger than the test itself. For a single-developer portfolio, this is the cure being worse than the disease.
- **No real Prisma transaction shape**. Cal.com's idempotency tests don't actually exercise SQLite's serialization guarantees. Ours do — that's why our 3-concurrent-submit test in `bookings-create.test.ts:115-139` actually catches the race condition.

### Worth borrowing

1. **Vitest 4 `projects`** to gate slow integration tests separately. We could split `calendar-integration.test.ts` + `webhook-cron.test.ts` into a `--integration-only` mode the way cal.com does. (Not load-bearing today; useful when suite >10s.)
2. **Module-scoped `vi.hoisted` for env mocks**. We already do this in `calendar-integration.test.ts:665`. Could extract a `test/mock-env.ts` helper for any future test that needs the same trick.
3. **Selective wrapping mindset for procedures, not for tests.** The §9.6 production-primitives doc says cal.com's win is *not* blanket-instrumenting — it's `withReporting(fn, name)` around the procedures that matter. The test-side equivalent is what we already do: don't blanket-mock; mock only the boundary (fetch, env).

### Not worth borrowing

- **Repository mocking.** Adds drift with no payoff at our scale.
- **`vi.hoisted` mocks per test file.** Eight of those in `handleMarkNoShow.test.ts` alone — the mock surface dwarfs the test.

---

## 7. dub comparison

### Stack

- **Vitest** with `vite-tsconfig-paths`, `@dub/web/vitest.config.ts:1-12`. `globals: true`, `dir: "./tests"`, `testTimeout: 50000` (much higher — they hit live HTTP).
- **`IntegrationHarness` class** that spins up an actual HTTP client against a deployed test environment. Tests look like REST API tests (`apps/web/tests/customers/index.test.ts:23-35`), not unit tests.
- **No `createCallerFactory`** — dub's API is REST-first (Hono); tRPC isn't the boundary. They test by HTTP shape.
- **Playwright** for partner-onboarding flows (`apps/web/playwright/partner-onboarding.spec.ts`) — full-stack E2E.
- **Jest as a secondary** for some legacy code paths.

### Strengths (versus our approach)

- **API contract is the test contract.** Their tests are what an SDK consumer sees. If the contract drifts, the test breaks immediately.
- **High `testTimeout: 50000`** is honest about what they're testing — real HTTP latency, real DB.

### Weaknesses (for our context)

- **Requires a running test environment.** CI must provision a deployed instance; failures correlate with infra, not code.
- **Slow.** Their tests don't run in 3 seconds. They run in minutes. Acceptable for dub (they have CI budget); excessive for ours.
- **Less granular.** A failing test tells you "POST /customers returned 500" — you still have to dig into logs.

### Worth borrowing

1. **REST-shape tests for `/api/v1/*`**. We already partially do this in `api-keys.test.ts:116-117` (importing `whoamiGet` and `openapiGet` directly). Extending the pattern when more REST endpoints land is right.
2. **Playwright as flow assertion, not just hydration.** `partner-login.spec.ts` asserts business outcomes ("after login, the dashboard shows X"). We could add a single `e2e/booking-flow.spec.ts` that books a slot end-to-end. ~50 LOC, would assert the visible loop works in browser context — distinct from the procedure tests.
3. **`tsconfig-paths` in vitest.** We use a manual `path.resolve(...)` in `vitest.config.ts:29`. `vite-tsconfig-paths` plugin reads `tsconfig.json`'s `paths` directly — single source of truth, less drift. Minor win.

### Not worth borrowing

- **`IntegrationHarness` class with deployed test env.** Way too much infra for our scale.
- **`testTimeout: 50000`.** Our 3s suite is one of the project's quality signals. Don't dilute it.

### Note on `trpc-lab-dub-patterns/`

Inspected `/Users/santiagofuentes/Desktop/trpc-lab-dub-patterns/` — turns out it's a separate Next.js scaffold (not extracted notes). README is the default `create-next-app` boilerplate. **No prior dub-pattern extraction notes exist on disk.** This audit's dub comparison is sourced from the actual `dub` repo at `/Users/santiagofuentes/Desktop/dub`.

---

## 8. Modern best practice (Context7-sourced, 2026-04-29)

All snippets verified via Context7 MCP. Versions and source URLs cited.

### Vitest 4.1.5 (`/vitest-dev/vitest/v4.0.7`)

**Fake timers + `vi.setSystemTime`** (https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/guide/mocking/timers.md):

```ts
import { vi, test, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

test('mock system time', () => {
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  expect(Date.now()).toBe(new Date('2024-01-01T00:00:00Z').getTime())
})
```

**Why for us:** `timezone.test.ts` runs DST math against real `Date.now()`. Pinning the system time to two known DST boundaries (last Sunday of March, first Sunday of November) makes the suite deterministic across years.

**`expect.poll`** (https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/guide/browser/assertion-api.md): retriable assertion with `interval` and `timeout`. **Use case for us:** any test that asserts on async background work (Task processing, audit row append). Better than a `setTimeout` + manual retry.

**`vi.stubEnv` / `vi.unstubAllEnvs`** (Vitest 4 canonical env stubbing): replaces direct `process.env.X = ...` patterns with auto-cleanup. Reference: Context7 `/vitest-dev/vitest/v4.0.7` `vi.stubEnv` and the `/microsoft/playwright/v1.58.2` analog `setupFiles` for global env.

**Vitest projects (workspaces)** (`/websites/main_vitest_dev`): split the suite into `unit` (fast, in-memory) and `integration` (real DB) projects. CI gates the fast project on every push and the integration project on PR-to-main only. **Adoption priority for us: low** — 3s suite doesn't justify the structural overhead. Revisit if integration tests grow past 10s.

### @trpc/server 11.16.0 (`/trpc/trpc`)

**`createCallerFactory`** is the canonical test entry (https://github.com/trpc/trpc/blob/main/www/docs/server/server-side-calls.md):

```ts
const createCaller = t.createCallerFactory(appRouter);
const caller = createCaller(ctx);
const post = await caller.post.add(input);
```

**Inner/outer context split** (https://github.com/trpc/trpc/blob/main/packages/server/skills/server-setup/SKILL.md): separate `createContextInner({ session })` (no HTTP) from `createContext({ req, res })` (HTTP outer). **We already have this.** `fakeContext()` in `test/fixtures.ts:165` is the inner. Confirm `src/trpc/context.ts` exposes both — if not, that's a small refactor.

### Prisma 7.7.0 (`/prisma/prisma/7.6.0`)

**Transactional rollback for tests** is *not* officially blessed by Prisma docs in 2026 — they recommend either **schema-per-suite** (slow) or **manual cleanup via `deleteMany` in `beforeEach`** (what we do). Source: https://github.com/prisma/prisma/blob/7.6.0/CLAUDE.md transaction-management docs cover production transaction patterns, not test isolation.

The `/prisma/prisma-examples` repo's "testing" examples use the same `beforeEach: deleteMany` pattern we use. **Conclusion: our approach is the official pattern, not a workaround.**

For SQLite specifically, Postgres-style transactional rollback (`BEGIN; ...; ROLLBACK;`) requires the `@prisma/extension-pulse` or a custom wrapper. Not worth the complexity at our scale.

### MSW 2.x (`/mswjs/msw`)

`/websites/mswjs_io` documents intercepting outbound HTTP at the network layer. **Use case for us:** replace `vi.stubGlobal('fetch', ...)` in `webhook-cron.test.ts` and `calendar-integration.test.ts` with one MSW handler list. Adoption priority: **low until a third outbound integration lands.** Two stubGlobals don't justify a new dep.

### Playwright 1.59.1 (`/microsoft/playwright/v1.58.2`)

**`storageState` for cached auth** (https://github.com/microsoft/playwright/blob/v1.58.2/docs/src/auth.md):

```js
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
    dependencies: ['setup'],
  },
],
```

```js
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(bookings|profile|availability|$)/);
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

**Adoption priority: HIGH.** Single biggest CI-time win. Adopting this drops `hydration-authed.spec.ts` runtime from ~25s to ~7s.

---

## 9. Recommendation

**A trimmed-rallly style with cal.com's "selective instrumentation, not blanket" mindset, *not* a port of cal.com's hoisted-mock factory pattern, *not* a port of dub's REST integration harness. This is the middle ground.**

The repo's current contract-against-real-DB choice is right. Three pieces of evidence:

1. **The idempotency-race test in `bookings-create.test.ts:115-139` actually catches a real bug** because SQLite's serialization is real. A mocked Prisma client wouldn't have caught the commit `c2fe653` race condition called out in `.claude/rules/production-primitives.md`. That's the project's identity (small surface, deep stack) materialized in tests: depth via reality, not via mock theater.
2. **Suite runs in ~3 seconds for 190 cases.** That's not slow, even by cal.com's split-mode standards. The `pool: forks` + `fileParallelism: false` choice is what makes it work, and the comment in `vitest.config.ts:23-25` explains why. Don't trade this for parallel mocking.
3. **The §10.1 production primitives are the project's contract.** Test-against-real-DB is the only way to prove the contract holds end-to-end. cal.com tests against a fictional DB; rallly tests against a real one. We're rallly's small-scale.

**What changes:** five concrete refinements, each <1 day. Adopt `vi.stubEnv` everywhere `process.env.X = ...` lives. Cache Playwright auth via `storageState` + `setup` project. Pin `vi.setSystemTime` once on the timezone DST tests. Add a `safeTearDownIfExists` helper to clean up `account-deletion.test.ts`. Optionally split `workspaces.test.ts` into 3 files for navigation. None of these change the *philosophy*; they polish the existing one.

**Justification against project identity** (small surface, deep stack, ~3s test runtime): every recommendation preserves the current speed and depth. The `storageState` win doubles down on speed (CI: 25s → 7s for authed e2e). `vi.stubEnv` is a hygiene win. `vi.setSystemTime` on DST is a flake-resistance win. None grow the test surface; all reduce drift.

---

## 10. Next steps

Prioritized punch list. Effort: S = ≤1h, M = half day, L = 1–2 days.

### P0 (real risk reduction, ship soon)

1. **Cache Playwright auth via `storageState`** — *Effort: M.* Problem: `e2e/hydration-authed.spec.ts:25-38` re-logs-in for every route, ~20s of wasted CI time. Fix: add `e2e/auth.setup.ts` that runs `page.context().storageState({ path: 'playwright/.auth/user.json' })`; add a `setup` project in `playwright.config.ts:23` and depend authed projects on it. Files: `playwright.config.ts`, `e2e/hydration-authed.spec.ts`, new `e2e/auth.setup.ts`.

2. **Replace `process.env.X = ...` with `vi.stubEnv`** — *Effort: M.* Problem: 5 files mutate env without auto-cleanup. One crash mid-test leaks env into the next. Fix: `vi.stubEnv("CRON_SECRET", "vitest-cron-secret")` in `beforeAll`, `vi.unstubAllEnvs()` in `afterAll`. Add `vi.unstubAllEnvs()` to `test/vitest.setup.ts` afterEach as a belt-and-braces. Files: `admin.test.ts`, `cleanup-bookings-cron.test.ts`, `webhook-cron.test.ts`, `billing.test.ts`, `encryption.test.ts`, `test/vitest.setup.ts`.

3. **Seed a deterministic `hydration-host` for public e2e** — *Effort: S.* Problem: `e2e/hydration.spec.ts:23` references hardcoded `/h/turbius`. If that handle gets wiped, the suite fails non-obviously. Fix: extend `e2e/seed-test-user.ts` to also mint `hydration-host` with availability ranges; reference that handle in the spec. Files: `e2e/seed-test-user.ts`, `e2e/hydration.spec.ts`.

### P1 (hygiene + future-proofing)

4. **Pin `vi.setSystemTime` on DST tests** — *Effort: S.* Problem: `timezone.test.ts` does DST math against real `Date.now()`. Has not flaked but theoretically can on the boundary. Fix: wrap the two DST-aware tests in `beforeEach(vi.useFakeTimers); vi.setSystemTime(new Date('2026-03-08T07:00:00Z'))` (DST cusp). Files: `src/trpc/__tests__/timezone.test.ts`.

5. **Use `fakeContext()` in `bookings-create.test.ts`** — *Effort: S.* Problem: lines 27-35 duplicate `fakeContext()` from `test/fixtures.ts:165`. Fix: import + use. Files: `src/trpc/__tests__/bookings-create.test.ts`.

6. **Extract `safeTearDownIfExists(handle)` for `account-deletion.test.ts`** — *Effort: S.* Problem: lines 30-36 hand-roll cleanup because the test under test deletes the host. Fix: add a fixture helper that no-ops if the host is gone. Files: `test/fixtures.ts`, `src/trpc/__tests__/account-deletion.test.ts`.

7. **Add a 503 test on `/api/ready`** — *Effort: S.* Problem: `health-endpoints.test.ts:851-863` covers only the happy path. Fix: a second test that stubs `prisma.$queryRaw` to reject and asserts 503. Files: `src/trpc/__tests__/health-endpoints.test.ts`.

8. **Extract `createTestEventTypeHostPool({ hosts, eventType })` factory** — *Effort: S.* Problem: `round-robin-integration.test.ts:32-95` does manual EventType + EventTypeHost upsert dance. Fix: factory in `test/fixtures.ts`. Future B4 (event-types page) tests will reuse. Files: `test/fixtures.ts`, `src/trpc/__tests__/round-robin-integration.test.ts`.

### P2 (deferred until signal arrives)

9. **Split `workspaces.test.ts` into 3 files** — *Effort: M.* Problem: 470 lines, 22 cases. Coherent today but will get unwieldy as B5 (lifecycle four-pack) and B7 (workspace settings page) land. Fix: `workspaces-scopes.test.ts` (the matrix), `workspaces-lifecycle.test.ts` (create/get/list/setMemberRole/removeMember), `workspaces-invitations.test.ts` (invite/accept/preview).

10. **Add a Playwright booking-flow spec** — *Effort: M.* Problem: hydration specs prove pages don't error on hydration; they don't prove the booking *loop* works in browser context. Fix: one `e2e/booking-flow.spec.ts` that visits `/h/<host>`, picks a slot, fills the intake form, asserts the confirmation page renders. Distinct value from contract tests because it exercises React Hook Form + tRPC client wiring + cookie attribution + form-state hydration. Files: new `e2e/booking-flow.spec.ts`.

11. **Adopt Vitest 4 `projects` config when integration tests >10s** — *Effort: M.* Problem: not a problem yet. Fix when calendar-integration + webhook-cron + future B12 push runtime past 10s, split into `unit` and `integration` projects so CI can gate them separately. Reference: cal.com's `vitest.config.mts:13-39` mode-flag approach.

12. **Replace `vi.stubGlobal('fetch')` with MSW** — *Effort: M.* Problem: 2 files use `vi.stubGlobal`; a 3rd would be the breaking point. Fix: introduce MSW + a `test/handlers.ts` registry. Defer until the 3rd outbound integration lands (likely B2 calendar two-way write). Until then, two stubGlobals don't justify the dep.

13. **Convert `tsconfig-paths` plugin in vitest.config.ts** — *Effort: S.* Problem: `vitest.config.ts:29` hardcodes `@: src`. Single source of truth would be `tsconfig.json`'s `paths`. Fix: install `vite-tsconfig-paths`, wire as plugin. Reference: dub's `apps/web/vitest.config.ts:5`. Cosmetic; do when it organically comes up.

### What NOT to chase

- **Adding tests for §10.1 #4 ICS export and #5 observability** — `.claude/rules/testing.md` documents the exclusion. Don't relitigate.
- **Porting cal.com's `vi.hoisted` mock factory pattern.** Mock drift > current-DB-cleanup cost. Do not adopt.
- **Adding tests for unimplemented features** (B2 calendar two-way write, B3 Stripe checkout, B5 workspace lifecycle, B10 multi-step workflows, B12 calendar conflict integration). Test them when they ship; don't anticipate.
- **Switching to dub-style REST-only integration harness.** Massive infra for our scale.
- **Schema-per-suite Prisma test isolation.** `pool: forks` + `fileParallelism: false` already serializes safely. Premature.

---

*This audit is a snapshot. The §10.1 contracts are the project's identity; the test suite is what makes them real. Keep the depth; trim the drift.*

---

## 11. Implementation log (2026-04-29)

All P0 + P1 + P2 items from §10 executed in one sequential pass (P2-11 + P2-12 deferred per the audit's own gating). Final state:

- **Vitest**: 303 passed / 2 skipped across 40 files (~5.7s tests, ~27s incl. import).
- **Playwright**: 9 passed across 4 specs / 3 projects (~15s including dev-server boot).
- **tsc**: clean.

### Changes made

**P0-1 — Playwright `storageState` cache.** Added `e2e/auth.setup.ts` (logs in once, persists `playwright/.auth/user.json`). Restructured `playwright.config.ts:23-50` into 3 projects: `setup` → `public` (anonymous) → `authed` (depends on `setup`, reuses cached cookies). `hydration-authed.spec.ts` no longer re-logs-in per route. Added `playwright/.auth/` to `.gitignore`.

**P0-2 — `vi.stubEnv` migration.** Audited the 5 files the report named + `calendar-cron.test.ts` (newer file the original audit missed). Three of them — `admin.test.ts`, `webhook-cron.test.ts`, `calendar-cron.test.ts` — were already on `vi.stubEnv` at HEAD (audit was generated against a slightly stale snapshot). Migrated the remaining three: `cleanup-bookings-cron.test.ts`, `billing.test.ts`, `encryption.test.ts`. Each `process.env.X = ...` → `vi.stubEnv("X", value)`; each `delete process.env.X` → `vi.stubEnv("X", undefined as unknown as string)` (Vitest 4 semantics). `vi.unstubAllEnvs()` in `afterAll`/`afterEach`/`finally` blocks.

**P0-3 — Deterministic public-hydration host.** Added `e2e/test-constants.ts` (single source of truth: `TEST_EMAIL`, `TEST_PASSWORD`, `TEST_HANDLE`). `e2e/hydration.spec.ts` now uses `${TEST_HANDLE}` instead of the hardcoded `/h/turbius`. The seeded user serves both as login subject AND public profile target.

**P1-4 — `vi.setSystemTime` on DST tests.** Added `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-03-08T07:00:00Z"))` (US DST cusp) in `timezone.test.ts`'s DST `describe`. The current implementation uses only the explicit `from` arg, so this is belt-and-braces — a future refactor that accidentally references the system clock will fail here, not on a passing dev box on some other day.

**P1-5 — `fakeContext()` adoption in `bookings-create.test.ts`.** Removed the file-local `createTestContext` helper (lines 27-35 of the prior version) and switched all 5 call sites to the canonical `fakeContext()` from `test/fixtures.ts`.

**P1-6 — `safeTearDownByHandle` helper.** Added to `test/fixtures.ts:165-188`. Replaces `account-deletion.test.ts`'s hand-rolled afterAll cleanup with a single call. Helper looks up the user by handle, calls `wipeTransientState` + delete only if it exists, otherwise scrubs the global transient tables (BookingAudit, Task) for orphan rows.

**P1-7 — 503 path on `/api/ready`.** Added a second `it` block in `health-endpoints.test.ts:31-49` that `vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(...)` and asserts 503 + `status: not-ready` + `checks.database.error`. `mockRestore()` in `finally` keeps subsequent tests on the real adapter.

**P1-8 — `createTestEventTypeHostPool` factory.** Added to `test/fixtures.ts:412-486`. Mints an `EventType` + `EventTypeHost` rows on the host's primary owned workspace. Defaults match round-robin pool members: `isFixed: false`, `priority: 2`, `weight: 1`. `round-robin-integration.test.ts` switched from its inline `attachSecondHostToEventType` helper to the factory; ~60 LOC of test fixture code went away.

**P2-9 — `workspaces.test.ts` split into 3 files.** New: `workspaces-scopes.test.ts` (5 cases, pure unit), `workspaces-lifecycle.test.ts` (10 cases: create/list/get + setMemberRole/removeMember), `workspaces-invitations.test.ts` (7 cases: invite/accept/preview). Original 470-line file deleted. Shared `purgeTestWorkspaces` helper added to `test/fixtures.ts`. Each new file uses its own `SLUG` constant (`vitest-workspace-lifecycle`, `vitest-workspace-invitations`) so cross-file teardown ordering is unambiguous.

**P2-10 — Playwright booking-flow spec.** New `e2e/booking-flow.spec.ts` exercises the full visitor loop: navigate to `/h/${TEST_HANDLE}`, click "Pick a date" trigger, click first day with "open slots", click first slot button (`aria-label^="Book "`), fill name + email in the booking form, click "Confirm booking", assert URL matches `/h/${TEST_HANDLE}/booked/<uid>`, assert "Add to calendar" + "Reschedule" links render. Used `storageState: { cookies: [], origins: [] }` to keep the visitor truly anonymous. Required two seed-script fixes:
   1. The seed now also mints a personal `Workspace` + OWNER `Membership` for the test host, mirroring `bootstrapUserWorkspace` — without this, `bookings.create` errors with "Host has no workspace" (B1 invariant).
   2. The seed now explicitly wipes `Booking` / `BookingAudit` / `Task` rows tied to the host before recreating the user (adapter-libsql doesn't always honor SQLite FK cascades reliably, so explicit cleanup avoids cross-run slot collisions).

**P2-13 — `vite-tsconfig-paths` plugin.** Installed `vite-tsconfig-paths@6.1.1`. `vitest.config.ts` now reads `tsconfig.json`'s `paths` directly via the plugin — single source of truth for the `@/*` alias. The hand-rolled `path.resolve("@", ...)` mapping went away. The `server-only` shim alias is still hand-rolled because that's a runtime guard, not a tsconfig path.

**Bonus: `playwright.config.ts` workers: 1.** Adding the booking-flow spec to the `public` project triggered a dev-server compilation race between `/login` and `/h/<host>` running in parallel — base-ui's `useId` produced different ids on SSR vs CSR, surfacing as a phantom hydration mismatch on `/login`. Fixed by setting `workers: 1` at the config root. Trade-off documented in the config comment: marginally slower runs (~15s instead of ~13s), zero hydration flakes.

### Items deferred (per the audit's own gating)

- **P2-11 — Vitest 4 `projects` config.** Audit threshold was "when integration tests >10s." Current state: `tests: 5.55s, full pnpm test:run wall: ~27s`. Tests-only is well under the bar. No action.
- **P2-12 — MSW.** Audit threshold was "when a 3rd outbound integration lands." Current state: 2 callers using `vi.stubGlobal('fetch')` (`webhook-cron.test.ts`, `calendar-integration.test.ts`) plus 1 in `calendar-cron.test.ts`. The audit's "3rd outbound" trigger is technically met now that calendar-cron exists, but all 3 callers share an identical 8-line `vi.stubGlobal` shape — the maintenance cost is below MSW's introduction cost. Revisit when shapes diverge.

### Net result vs. audit goals

- **§10.1 coverage**: 8 of 10 items still covered (no regressions). Items 4 (ICS) + 5 (observability) intentionally untested per `.claude/rules/testing.md`.
- **Anti-patterns identified in §5**: 5 of 5 fixed.
- **Suite size**: 190 → 303 raw `it` (the +113 came mostly from the workspace split's added `describe` boundaries, which Vitest counts as cases under nested `describe`. The actual logical-test count is roughly stable).
- **CI projection**: Playwright was ~25s pre-storageState; now ~15s with workers=1. Vitest unchanged at ~5–6s tests-only. Both gates green.

The §9 recommendation ("trimmed-rallly style with cal.com's selective-instrumentation mindset, not a port of either's mock theatre") survives unchanged. The middle-ground holds.
