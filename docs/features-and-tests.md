# Officehours — Features & Test Guide

A complete map of every feature shipped from the project's first
production-engineering commit (`60c7e25` — booking idempotency,
2026-04-13) through HEAD, plus how to verify each one works.

The first part is a **sequential feature catalog** — every commit
that introduced or substantively changed a user-facing or
internal-engineering primitive, in the order it landed.

The second and third parts split testing by audience:

- **Part 2 — User-facing tests** are end-to-end manual checks: open
  the browser, click the thing, see the expected outcome. Use these
  to verify the product still works for real visitors and hosts.
- **Part 3 — Internal feature tests** cover plumbing the user never
  sees but every other feature relies on (idempotency, rate limit,
  webhooks delivery, env validation, etc.). Mostly vitest specs with
  one curl recipe each.

If you want one canonical "what's shipped vs. open" table, read
[`BACKLOG.md`](../BACKLOG.md) — that's the source of truth. This
doc is the *narrative + test recipe* that complements it.

---

## Table of contents

1. [Part 1 — Sequential feature catalog](#part-1--sequential-feature-catalog)
   - [Phase 0 — §10.1 production primitives (foundation)](#phase-0--§101-production-primitives-foundation)
   - [Phase 1 — Tier A inward depth](#phase-1--tier-a-inward-depth)
   - [Phase 2 — Tier B real systems](#phase-2--tier-b-real-systems)
   - [Phase 3 — Tier C portfolio stretch](#phase-3--tier-c-portfolio-stretch)
   - [Phase 4 — Surface UI batch + polish](#phase-4--surface-ui-batch--polish)
   - [Phase 5 — Post-tier closures (PT items)](#phase-5--post-tier-closures-pt-items)
   - [Phase 6 — Documentation + tooling](#phase-6--documentation--tooling)
2. [Part 2 — User-facing testing](#part-2--user-facing-testing)
3. [Part 3 — Internal / non-user-facing testing](#part-3--internal--non-user-facing-testing)

---

## Part 1 — Sequential feature catalog

### Phase 0 — §10.1 production primitives (foundation)

The first ten items hardened the booking loop. Each is a small,
focused commit. After this phase the loop is double-click-safe,
audit-traced, rate-limited, observable, webhook-fanned-out, soft-
deletable, live-streamed, attribution-aware, and feature-flag-gated.

| # | Item | Commits |
|---|---|---|
| §10.1.1 | **Idempotency on `bookings.create`** — `Booking.idempotencyKey String? @unique`. Visitor form generates a UUID once at mount; double-click / retry produces exactly one row via `prisma.booking.upsert`. | `60c7e25` |
| §10.1.2 | **`BookingAudit` table** — every state change writes a row with `actor` (USER/VISITOR/SYSTEM/APP), `action` (CREATED/CONFIRMED/CANCELLED/RESCHEDULED), `data` JSON snapshot, `operationId`. NO foreign key to Booking — audit rows survive deletion. | `bcce9e7` |
| §10.1.3 | **Rate limit on `bookings.create`** — in-memory fixed-window limiter (rallly's pattern), Upstash Redis fallback when `UPSTASH_REDIS_REST_URL` set. Bucketed at 10/min/IP. | `6bf7e71` |
| §10.1.4 | **ICS download on confirmation page** — `GET /api/bookings/:uid/ics` returns a calendar-importable file. | `4778d86` |
| §10.1.5 | **Selective observability via `withSpan`** — wraps `bookings.create` + `bookings.cancel` only (never blanket middleware). Sentry server + edge configs. | `b9f4301`, `091af84` |
| §10.1.6 | **Webhook subscriptions + delivery** (3 commits) — `WebhookSubscription` (URL + secret + events). `Task` queue with `attempts/maxAttempts/lastError/referenceUid`. HMAC-SHA256 via `crypto.subtle`. Vercel cron at `/api/cron/process-tasks`. | `59db28e`, `42e34f9`, `dc8f592` |
| §10.1.7 | **Soft delete + cleanup cron** — `Booking.deleted Boolean + deletedAt DateTime?`. Every read filters `deleted: false` (5 sites). 30-day retention then hard-delete via cron, audit rows preserved. | `032e88b`, `8806b0d` |
| §10.1.8 | **SSE live host queue** — tRPC SSE subscription bus + in-memory `EventEmitter`. Host dashboard receives `booking.created` / `booking.cancelled` live. | `ed2510a`, `c4efce7` |
| §10.1.9 | **Attribution `?ref=` cookie** — edge middleware writes a 30-day cookie when a visitor lands via `?ref=...`; booking flow records it on `Booking.referrer`. | `1121db4` |
| §10.1.10 | **Feature flags** — `Feature` (slug + enabled + type enum: RELEASE/EXPERIMENT/OPERATIONAL/KILL_SWITCH/PERMISSION) + `UserFeatures` join. Live-queue gated behind the `live-queue` flag. | `f6972cd` |

**Test infrastructure that landed alongside:**

- `c2fe653` — vitest setup + idempotency contract tests
- `a55e900` — unit tests for items 2, 3, 6, 7, 8, 9, 10
- `b15e44c` — Prisma migrations from items 6, 7, 8 tracked
- `b4bf248` — ICS route consolidation + Turbopack workspace root pin
- `06b22b6` — Playwright nav-hydration smoke
- `e33aa19` + `33184e8` + `0b14961` — CI workflow
- `887c6e2` — untrack Playwright MCP browser logs
- `71123f7` — `useSyncExternalStore` replaces the legacy `useState(false)+useEffect(setMounted(true))` pattern
- `18f7a77` — refresh CLAUDE.md for the §10.1 era
- `cac6c85` — remove halftone masthead per user preference
- `2060c9b` — kill live-queue startup flash, drop labels, reposition into header aside

---

### Phase 1 — Tier A inward depth

Fifteen items expanding the surface around the loop. Email plumbing,
i18n, timezones, account deletion, onboarding, reschedule, reminder
emails, admin surface, structured logger, theme picker, error pages,
health endpoints. Each shippable in a day.

| # | Item | Commit |
|---|---|---|
| A1 | **Real email layer** — Resend + React Email + `delivered@resend.dev` dev sink + `[branch]` subject prefix. Templates: `booking-created`, `booking-confirmed`, `booking-cancelled`. Routed through the Task queue. | `dbde851` |
| A2 | **Env validation** — `@t3-oss/env-nextjs` zod schema, build-time fail-fast on missing/typo'd vars. | `890fa64` |
| A3 | **IANA timezones + DST-aware slots** — `User.timezone` + `Booking.visitorTimezone` IANA strings. Server resolves host ranges to UTC, generates slots, client renders in visitor's zone. Change-detection prompt on localStorage zone delta. | `aeb7eb4` |
| A4 | **Account deletion typed-email confirm** — `/settings` Delete Account section, typed-email match before mutation. Audit row `actor: USER, action: ACCOUNT_DELETED`. | `731d980` |
| A5 | **i18n via next-intl** — `app/[locale]` directory, cookie + Accept-Language negotiation. en + es shipped. | `9f5073e` |
| A6 | **Onboarding checklist** — first-run progress ring on `/bookings`. Tasks: pick handle, set availability, share URL, get first booking. Fixed by `690f819` (cache parsed Set so `useSyncExternalStore` stays stable). | `a629577`, `690f819` |
| A7 | **Visitor-driven reschedule** (procedure) — `bookings.reschedule(uid, newSlot)`, atomic cancel-old + create-new, `Booking.rescheduledFromUid`, audit chain `RESCHEDULED_FROM` + `RESCHEDULED_TO` with same `operationId`. Webhook `booking.rescheduled` fires with both UIDs. UI shipped later as A.PT9 (`7bcdcfa`). | `040a33f` |
| A8 | **Reminder email job** — cron-backed reminder 1h before slot. Schedule on `booking.confirmed`, cancel on `booking.cancelled`, swap on reschedule. Originally hardcoded; later promoted to editable Workflow row at `238771c`. | `2ea6380`, `f813282`, `c74477f`, `c1b4893`, `1d01cb3` |
| A9 | **Admin operator surface** — `/admin/feature-flags`, `/admin/webhooks`, `/admin/audit/[bookingUid]`. Gated by `OFFICEHOURS_ADMIN_HANDLES` env. | `7259763` |
| A10 | **Structured JSON logger (pino)** — leveled emit gating (debug/info/warn/error). Replaces `console.log` in `withSpan`. | `b89ac84` |
| A11 | **Cleanup-cron retention tests** — locks 30-day retention + audit-survival invariants. | `19649d2` |
| A12 | **Composable test factories** — `createTestUser/Booking/Webhook/Audit` reused across vitest suite. | `59cefbd` |
| A13 | **Theme picker (light / dark / system)** — `/settings` tri-state cycle, OS-pref escape hatch, preview cards. Cookie + localStorage durable. | `980d9e1` |
| A14 | **Brutalist error pages** — branded 404, 500, global-error fallbacks. | `b63c921` |
| A15 | **`/api/health` + `/api/ready`** — liveness (process alive) + readiness (DB + Redis reachable). | `5aa8d3c` |

---

### Phase 2 — Tier B real systems

Each turns the project from single-host scheduler into a real
multi-tenant SaaS surface. Schemas, OAuth flows, webhooks against
external providers, billing infrastructure.

| # | Item | Commit |
|---|---|---|
| B1 | **Workspaces foundation** — `Workspace` + `Membership` (user × workspace + role: OWNER / ADMIN / MEMBER / VIEWER) + `Invitation`. Scope-permission-role matrix. `requireMembership(slug, userId, scope)` middleware. Personal workspace auto-bootstrapped at register. | `2306114` |
| B2 | **API keys + bearer auth + OpenAPI 3.1** — `ApiKey` (`tokenHash` sha256+salt, `prefix`, `scopes` csv, `lastUsedAt`, `revokedAt`). Token format `oh_<nanoid24>`. Workspace-scoped. `/api/v1/*` endpoints with bearer auth. Spec at `/api/openapi.json` generated from zod via `zod-openapi`. | `7df9072` |
| B3 | **Calendar busy-time sync (Google + Outlook)** — `CalendarCredential` + `SelectedCalendar`. Adapter pattern, two impls. `fetchHostBusyTimes` + `listCalendars`. Slot generation merges + subtracts. | `ef65c97` |
| B4 | **Workflows engine** — `Workflow` (trigger + offsetMinutes + action + template). Cron processes due workflows by enqueuing Task rows. Single-action only at first. Settings UI at `d22c9d6`. | `1dbab8b` |
| B5 | **Workspaces UI pages** — `/workspaces`, `/workspaces/<slug>/members`, `/invitations/<token>` accept page. | `e69f1ca` |

---

### Phase 3 — Tier C portfolio stretch

Five items shipped (one deferred-by-design with explicit trigger
conditions). Each is genuinely distinguishing engineering.

| # | Item | Commit |
|---|---|---|
| C1 | **Embeddable widget** — `<script src="cal-embed.js">`-style JS SDK + iframe with postMessage handshake. Inline embeds work; prerender / command queue / booked handlers deferred to C.PT5/6/7. | `07bd093` |
| C2 | **Stripe billing schema** — `Subscription`, `StripeEvent` (idempotency on event.id), plan-feature matrix, signed webhook handler. FREE / PRO / TEAM tiers. | `6d37510` |
| C3 | **Round-robin algorithm** — `selectHostFromPool(hosts, excludeHostIds, lookbackWindow)`. Priority + weight + fixed/pool tiers. Schema landed later at `5b8914e` (B.PT4). | `6307d5b` |
| C4 | **Magic-link auth** — next-auth `http-email` provider via Resend. Workspace bootstrap on first sign-in. Edge cases closed at `df85114` + `1d8b0c3`. | `8f9bde3` |
| C5 | **Cache-aside for `/h/[handle]`** — DEFERRED-BY-DESIGN. Documented trigger conditions in `docs/C5-cache-aside-deferred.md` (p95 > 800ms, sustained > 5 reads/s, or Postgres migration). | `6bace63` |
| C6 | **Public status page** — `/status` renders DB / Redis / Sentry / cron last-run. | `29787cc` |

---

### Phase 4 — Surface UI batch + polish

Settings page sections (calendar / API keys / workflows), workspace-
aware booking writes, scroll architecture, dashboard chrome, in-flight
bug fixes. Roughly the last third of the timeline.

**Surface UI batch (PRs):**

- `9eb0f0f` — workspace-aware booking writes (Booking.workspaceId migration + backfill, list/create/cancel/get scoped by workspace)
- `b6b0daa` — `/settings` Calendar section: connect Google/Outlook, list calendars, select toggles
- `4eb32b1` — `/settings` API keys section: workspace picker, token-shown-once, scope toggles
- `d22c9d6` — `/settings` Workflows section: CRUD UI for rule editing
- `88b8812` — `/login` magic-link form alongside credentials + GitHub
- `df85114` — magic-link edge cases: workspace bootstrap, redirects, error surfacing
- `1d8b0c3` — magic-link redirect-to-login loop fix
- `45c5722` — seed default Mon-Fri 9-5 availability at user create

**Calendar token security:**

- `773285f` — AES-256-GCM at-rest encryption for OAuth tokens via Prisma middleware (closed the explicit ef65c97 deferral)

**Workflows promote A8 → editable row:**

- `238771c` — A8's hardcoded reminder is now a default Workflow row seeded at register, with backfill for existing users

**Plan-gating sweep:**

- `1439e7f` — `requireFeature(plan, slug)` consulted in `workspaces.invite` (member cap), `workspaces.apiKeys.create`, `workflows.create`. FREE plan denies; PRO+ allows.

**Dashboard chrome / inner-window panel:**

- `ecfdafd` — dub.co-style rounded inner panel for `/(host)`
- `5b781dc`, `cdf2f3d`, `5335bb5`, `c39e312`, `d572ed0`, `45c2cd1`, `9c387c6` — sidebar floating variant + icon-collapse + footer move
- `e83028c` — `bru-host-content` fills viewport even when content is short
- `1afcc45`, `46bfd44`, `9920e5e`, `2772101` — sidebar margin / paint chain
- `5771f16`, `5296a85`, `85e49f5`, `fe779bc`, `c8817dc` — sidebar border + rail + spacing fixes
- `3419acf` — view-transition snapshot isolation

**Brutalist + responsive modal refactors:**

- `cf33cc4` — unify section chrome via `SectionHeader`
- `b44e236` — section actions below their controls
- `97cbeef` — extract `BrutalistSaveBar` (one canonical save affordance)
- `f2c72ff` — per-section save model on `/settings` (drop the lying global SaveBar)
- `4d97d09` — unify destructive-action confirmation via `ConfirmDialog`
- `4b3da04` — unify calendar list with workflow + api-key card-stack
- `9aa840a` — `ResponsiveModalBody` extracted (fix `sm:px-6` drift)
- `5ddf2bb` — `ResponsiveModalFooter` extracted (drop 4 verbatim duplications)
- `9dea29a` — bake brutalist title + header padding into `ResponsiveModal`
- `aa22647` — extract `BrutalistInlineEmpty` primitive
- `a9a037f` — brutalist empty-state icon convention
- `fc1b7b0` — empty-state pattern unified, drop heavy Empty primitive in api-keys
- `55df18d` — `brutalistGhost` everywhere (drop shadcn outline + dead classes)
- `8401587` — strip ApiKeyRow clutter to cal.com / dub.co restraint
- `6040d7f` — space out standalone three-dot indicators
- `a6ea04b` — extract `bru-legend` / `bru-description` / `bru-eyebrow` utilities
- `02d64a5` — hover direction + drop ad-hoc emerald accent
- `69da465` — standardize `aria-labelledby` across every section
- `1ab0a02` — design-token sweep replacing inline mono-caps strings
- `284f4c6` — localize hardcoded English strings
- `bf95323` — tighten descriptions, drop redundant theme hint

**Booking detail page (host-side):**

- `e583bbc` — host-side detail page at `/bookings/[publicUid]`. Audit timeline, pending Tasks, source attribution.
- `0ff29f1` — A.PT5 / A.PT6 / A.PT7 in one commit: prev/next chevron nav, delivery list, intercepted-route drawer
- `a2618dd` — single-card receipt for `/booked/[uid]` (drop cluttered grid)
- `87058d9` — stop tw-merge from collapsing button color into size class
- `a877e64` — scale receipt typography + canvas across breakpoints

**Settings page polish:**

- `cd1dc4a` — drop Instrument Serif, unify titles on Space Grotesk
- `a9e05e8` — center segmented-tab counts + drop nested pill
- `77abc22` — collapse rounded scale to two tokens
- `777f375` — resolve timezone list on server (stop hydration mismatch)
- `a8fabe8` — refresh agent rules for current radius + font system
- `a7fbc11` — keep ResponsiveModal trigger in SSR HTML (no first-paint flash)
- `f4610c9` — codify SSR-safe client-branch guardrails
- `c16fd32` — tri-state theme cycle, OS-sync hint, tighter dense column
- `ddbc425` — prefetch workspaces.list so API keys doesn't flash "Loading"
- `69cf423` — surface OS pref + escape hatch when theme pick overrides OS
- `cc89384` — eager nested prefetch + 10m gcTime + keepPreviousData on api-keys
- `2ffca4e` — fix personal-slug overflow (Zod was rejecting every slug-keyed call)
- `ee53de5` — kill live-queue layout shift on first paint
- `815cd76` — replace stretched theme fieldset with preview cards
- `59810f7` — equal-width Upcoming/Past segmented tabs
- `955e3d8` — codify the conventions learned in the settings refactor
- `05f14ca` — mobile-first row that unfolds at sm:, wider shell at md:+
- `ce6e5e3` — workspaces page aligns with settings patterns
- `96a0e0f` — chevron on `BlockChip` (match in-place row vocabulary)

**Scrolling architecture (Radix ScrollArea):**

- `6ada842` — true overlay scrollbar via Radix ScrollArea
- `b91718d` — restore overlay-style scrollbar inside `bru-host-content-inner`
- `6759303` — bind cookie-cutter to viewport so ScrollArea is the only scroll
- `9fa856f` — absolute-fill ScrollArea inside relative panel
- `2da98b2` — explicit height/width on ScrollArea Root
- `05b4836` — hide body scrollbar gutter on dashboard routes
- `b1bf46c` — override scrollbar-gutter in dashboard scope

**Dashboard top-bar:**

- `c9df11a` — top bar with workspace switcher dropdown (active state added later in B.PT6 at `63cebaa`)

---

### Phase 5 — Post-tier closures (PT items)

Items the original Tier A/B/C commits explicitly deferred. Each
closes a "shipped with deferral" gap.

**Tier A.PT (commit-flagged Tier A, ≤ 1 day each):**

| # | Item | Commit |
|---|---|---|
| A.PT1 | **`WORKSPACE_SLUG_MAX` module unification** — single-source-of-truth zod schema referenced by router + create dialog. | `75e9171` |
| A.PT2 | **Scalar UI for `/api/openapi.json`** — `@scalar/nextjs-api-reference` at `/api/v1/docs`. Interactive try-it-now reader. | `d18c156` |
| A.PT3 | **Per-key rate limiting on `/api/v1/*`** — bucket key `api-v1:${key.id}`, 60/min. Returns 429 with `Retry-After` + `X-RateLimit-*` headers. | `83a3d40` |
| A.PT4 | **Mocked-adapter calendar integration test** — full chain `getUpcomingSlots → fetchHostBusyTimes → google.getBusyTimes → fetch(freeBusy) → subtract`. | `0d36527` |
| A.PT5 | **Adjacent-booking prev/next nav** — chevron buttons on `/bookings/[publicUid]` + ←/→ keyboard. | `0ff29f1` |
| A.PT6 | **Webhook delivery list on detail page** — succeeded Tasks rendered under audit history. | `0ff29f1` |
| A.PT7 | **Sheet drawer for `/bookings/[publicUid]`** — Next 15 intercepted route + parallel slot. | `0ff29f1` |
| A.PT8 | **Resolve calendar-sync orphan plan gate** — wire `calendar.authUrl` through `requireFeature(plan, "calendar.connect")`. | `dfdaf46` |
| A.PT9 | **Visitor-facing reschedule UI** — "Reschedule" link on confirmation page + slot-picker awareness of `?reschedule=<uid>`. | `7bcdcfa` |

**Tier B.PT (commit-flagged Tier B):**

| # | Item | Commit |
|---|---|---|
| B.PT1 | **Workspace-aware webhooks + audit** — `WebhookSubscription.workspaceId` + `BookingAudit.workspaceId` migrations + procedure scope updates. | `f3a1cf6` |
| B.PT2 | **Calendar two-way write** — `createEvent` / `updateEvent` / `deleteEvent` adapter methods + Task-queue plumbing for Booking-side fan-out. Reschedule = delete-old + create-new. | `1a006f9` |
| B.PT3 | **Stripe checkout + portal procedures** — `billing.currentPlan`, `billing.startCheckout`, `billing.openPortal`. Workspace.write gated. Lazy Stripe client. | `e76402d` |
| B.PT3-UI | **Billing settings UI section + plan-gate inline prompts** — current-plan banner + 2-card upgrade grid + inline upgrade nudges on api-keys / workflows when FREE. | `63c4553` |
| B.PT4 | **`/workspaces/<slug>/event-types` page + procedures** — EventType + EventTypeHost schema, page UI, host-pool management. Round-robin algorithm now usable end-to-end. | `1f5b93a`, schema at `5b8914e` |
| B.PT5 | **Workspace lifecycle four-pack** — rename / delete / leave / transferOwnership procedures. UI for these landed in B.PT7. | `304eb36`, `54837eb` |
| B.PT6 | **Active-workspace cookie + global context switcher** — `oh_active_workspace` cookie + Next 15 server action + `ctx.activeWorkspaceSlug` + `workspaces.list` returns `isActive`. Top-bar dropdown + per-section defaults all read from one source. | `63cebaa` |
| B.PT7 | **Workspace settings page + lifecycle UI** — `/workspaces/[slug]/settings` with general / transfer-ownership / leave / danger-zone sections. Typed-confirm delete dialog. | `b1c71b7` |
| B.PT8 | **Resend + edit-pending-invite-role** — `workspaces.resendInvitation` (rotates token + refreshes expiry + re-enqueues email) and `workspaces.updateInvitationRole`. UI: inline role select + Resend button on InvitationRow. | `7925ec2` |
| B.PT9 | **Bulk invite (`workspaces.inviteMany`)** — all-or-nothing batch with one cap-check + per-row role-rule pre-pass + one transaction. Members-panel invite dialog refactored to `useFieldArray`. | `e03e822` |
| B.PT12 | **Calendar conflict → round-robin `excludeHostIds`** — `findBusyHostIds` helper joins B.PT2 + B.PT4. Multi-host pools route around busy hosts before throwing CONFLICT. | `2747bc3` |

**Signal-gated (NOT shipped, waiting on real-world signal):**

- B.PT10 — multi-step workflows (`WorkflowStep` chains)
- B.PT11 — SMS / Slack / Discord workflow actions
- B.PT13 — distribution fairness lookback decay cron
- B.PT14 — Upstash Redis swap for `createRatelimit`
- C.PT1 / C.PT2 / C.PT3 / C.PT4 / C.PT5 / C.PT6 / C.PT7 / C.PT8 / C.PT9 — see `BACKLOG.md` table for trigger conditions

---

### Phase 6 — Documentation + tooling

Doc consolidation + git hook + bootstrap helpers + CI extensions.

| Item | Commit |
|---|---|
| **Hash-gated bootstrap script + worktree helper** — idempotent setup; SessionStart hook auto-runs. | `58d3f78`, `b3a19bc` |
| **Per-domain tRPC router split** — slim `src/trpc/router.ts` merge file + `src/trpc/routers/<domain>.ts` per concern. | `ab1bbc9` |
| **Backlog source-of-truth consolidation** — `BACKLOG.md` becomes the single canonical status doc. `commit-msg` git hook enforces the contract: any commit referencing a backlog ID must touch BACKLOG.md. AGENTS.md gains the cross-agent rule. Three legacy docs deleted, two moved to `docs/`. | `f437235`, `f4795e2`, `b0feaa6`, `b13531a` |
| **Test suite audit + modernization** — P0/P1/P2 punch list. Aligns vitest + playwright stack to current canon. | `2da4ec1` |
| **B5 lifecycle test alignment** — close coverage gaps post-procedure-add. | `54837eb` |
| **Deferrals doc compilation** — single index of every commit-flagged open deferral (later superseded by BACKLOG.md). | `c2330a7`, `cd789f0` |

---

## Part 2 — User-facing testing

Walk these in order if you want to verify the product works end-to-end
for real visitors and hosts. Each block: **setup → action → expected
outcome**. Use a fresh browser private window for visitor flows; sign
in via `/login` for host flows.

> **Test data**: the seed script (`pnpm exec tsx e2e/seed-test-user.ts`)
> creates a user with handle `hydration-e2e` and personal workspace
> `hydration-e2e-personal`. Use that as your test host.

### 1. Sign up, set availability, share URL

1. Visit `http://localhost:3000/login`.
2. Use the **magic-link form**: enter your email, click "Continue with Email".
3. Check your inbox (or Resend dashboard in dev — the dev sink intercepts).
4. Click the link → you land on `/bookings`.
5. **Onboarding checklist** appears at the top of `/bookings` — first-run progress ring with tasks like "pick a handle", "set availability", "share your URL".
6. Click through to `/settings` → set your **timezone**. Save.
7. `/availability` → tap a day → drawer opens → drag handles to set hours → Save.
8. Visit `/profile` → set your handle (e.g. `alex`). Save.
9. Click **Share** → URL copied: `http://localhost:3000/h/alex`.

### 2. Visitor books a slot

1. Open `/h/alex` in a private/incognito window.
2. **Public host page** renders: name, bio, "next free 2:30 PM" hint, density strip, big "Pick a date" CTA.
3. Click **Pick a date** → drawer slides up showing the day strip + slot chips grouped by morning / afternoon / evening.
4. Tap a slot chip → intake form: name, email, one-sentence question.
5. Submit → confirmation page at `/h/alex/booked/<uid>`.
6. Confirmation shows: ✓ slot locked in, formatted date, share button, **"Add to calendar"** (downloads `.ics` file), **"Reschedule"** link.
7. Open the `.ics` in your OS calendar app → event imports correctly.

### 3. Visitor reschedules their own booking

1. From the confirmation page click **Reschedule**.
2. URL becomes `/h/alex?reschedule=<bookingUid>`.
3. Page renders with a top banner ("Reschedule mode") + slot picker.
4. Tap a different slot → drawer title becomes **"Confirm reschedule"**.
5. RescheduleConfirm shows the from→to delta + Confirm button.
6. Click Confirm → redirects to `/h/alex/booked/<NEW_uid>`.
7. New confirmation page shows the new slot + "Originally booked for ..." chain.
8. Both visitor + host receive a `booking-rescheduled` email.

### 4. Host sees + manages bookings

1. Sign in as the host. `/bookings` is the landing page.
2. **Live queue** in the header aside fires a counter when a new booking lands (test by leaving this tab open + booking from another window).
3. Click any booking row → **detail page** at `/bookings/<publicUid>` opens.
4. Detail page shows:
   - Header with `←` and `→` chevrons (prev / next bookings — keyboard ←/→ also work)
   - Audit timeline (every state change with actor + action + timestamp)
   - **Pending Tasks** sidebar
   - **Delivered** section (succeeded webhook deliveries with retry tag if `attempts > 1`)
   - Source attribution if the visitor came via `?ref=`
5. Click any booking row from `/bookings` again → opens as a **right-side drawer** (intercepted route). Hard-refresh the URL → loads as a full page.
6. Cancel a booking from the detail page → row moves to **Past** tab on `/bookings`. Audit row written. Visitor receives `booking-cancelled` email.

### 5. Theme + language picker

1. `/settings` → **Appearance** section → click the system / light / dark cards.
2. Theme cycles. Page chrome flips immediately, persists on reload.
3. **Language** section: switch en ↔ es. Page reloads with new locale; URL stays the same (cookie + Accept-Language negotiation).

### 6. Calendar sync (busy-time read + two-way write)

1. `/settings` → **Calendar** section → **Connect Google** (or Outlook).
2. OAuth consent screen → grant access → land back on `/settings`.
3. **Pick calendars** dialog opens automatically → toggle the calendars whose busy times should block bookings → Save.
4. Add a busy event in your real Google/Outlook calendar at, say, tomorrow 10:00.
5. Reload `/h/<your-handle>` → that 10:00 slot is **suppressed**.
6. **Two-way write**: book a slot at, say, tomorrow 11:00. Wait ~30 seconds for the cron, OR trigger it manually:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/cron/process-tasks
   ```
7. The booking now appears as an event in your real Google/Outlook calendar.
8. Cancel the booking in Officehours → cron fires → event disappears from your real calendar.

### 7. Workflows (user-configurable email + webhook rules)

1. `/settings` → **Workflows** section → click **Add workflow**.
2. Dialog: trigger `BEFORE_EVENT`, offset `60` minutes, action `EMAIL_VISITOR`, template `booking-reminder`.
3. Save. Row appears in the list, "Active" toggle on.
4. Book a slot 70+ minutes in the future.
5. Cron schedules a reminder Task 60min before the slot. Wait, OR set `accessTokenExpiresAt` artificially close + trigger cron manually.
6. At T-60min, the visitor receives a reminder email.

### 8. Webhooks

1. `/admin/webhooks` (you must have your handle in `OFFICEHOURS_ADMIN_HANDLES` env).
2. **Create webhook**: URL `https://webhook.site/<your-uuid>` (free webhook receiver), events `booking.created`, scope to a workspace.
3. From the visitor side, book a slot.
4. Trigger cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-tasks`.
5. webhook.site shows the POST: payload + `X-Officehours-Signature-256` HMAC.
6. Detail page for the booking now shows the delivery in the **Delivered** section.

### 9. Workspaces — multi-tenant

1. `/workspaces` → click **Create workspace**: name "Acme", slug `acme`. Submit.
2. Lands on `/workspaces/acme/members`.
3. **Settings** link in header → `/workspaces/acme/settings` opens.
4. **Settings page** shows four sections (when you're OWNER): General (rename + slug change), Transfer ownership (member picker), Leave (hidden — owner can't leave), Danger zone (typed-confirm delete dialog).
5. Rename to "Acme Inc.", change slug to `acme-inc`, Save → URL replaces to `/workspaces/acme-inc/settings`.
6. Members page → **Invite teammates**: dialog accepts multiple email + role rows (B.PT9 bulk). "Add another" button stacks rows. Submit → all rows land or all bounce (all-or-nothing).
7. Recipient receives email with `/invitations/<token>` link.
8. Open that link in a private window → preview page shows workspace name + role.
9. Sign in or register → **Accept** binds the invitation as a Membership.
10. Back on the members page, the new member's role can be changed via inline select. Pending invitations have **Resend** (rotates token, re-emails) and **Revoke** (with ConfirmDialog).

### 10. Workspace switcher (active context)

1. As a multi-workspace user, click the **top-bar dropdown** (workspace name with chevron).
2. Menu lists every workspace you're a member of, with a check on the active one.
3. Click another workspace → cookie sets, page refreshes, you navigate to that workspace's members page.
4. Visit `/settings` → **Billing**, **API keys**, **Workflows** sections all default to the active workspace.

### 11. Billing / Stripe

1. `/settings` → **Plan** section → current plan banner shows **FREE**.
2. Click **Upgrade to PRO** → browser hands off to Stripe Checkout.
3. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
4. `stripe listen` terminal logs the webhook fan-out. `Subscription` row written.
5. Lands on `/settings?billing=success`.
6. Reload → tier badge flips to **PRO**, **Manage Billing** button replaces Upgrade. API keys section unlocks.
7. Click **Manage Billing** → Stripe-hosted Customer Portal.

### 12. API keys + REST API

1. `/settings` → **API keys** section → **Create**: name `ci-test`, scope `workspace.read`.
2. Token shown ONCE: `oh_<24chars>`. Copy it.
3. Hit the REST API:
   ```bash
   TOKEN="oh_xxx..."
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/whoami
   # 200 — { keyId, scopes, workspace: {...} }
   ```
4. Burst 61 requests in 60s → request 61 returns **429** with `Retry-After`, `X-RateLimit-Limit: 60`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: <epoch>`.
5. Visit `/api/v1/docs` → **Scalar UI** loads with the OpenAPI 3.1 spec. Click any endpoint → "Authorize" → paste your token → "Try It" → 200.
6. **Revoke** the key in `/settings` → curl now 401s.

### 13. Embedded booking widget

1. Create a static HTML file:
   ```html
   <script src="http://localhost:3000/embed/cal-embed.js" data-handle="alex"></script>
   ```
2. Open in browser → iframe loads `/embed/alex`, slot picker renders.
3. Resize the parent window → iframe posts size, parent adjusts.

### 14. Account deletion

1. `/settings` → scroll to **Danger zone** → **Delete account**.
2. Dialog: type your account email exactly to confirm.
3. Submit → redirects to `/`. Your handle is anonymized; bookings tagged as deleted; audit rows preserved per the §10.1 invariant.

### 15. Status page

1. Visit `/status` (no auth required).
2. Renders DB / Redis / Sentry / cron last-run state.
3. All green when env is healthy.
4. Stop the DB process → reload → DB row turns red.

### 16. Public health endpoints

```bash
curl -s -w "%{http_code}\n" http://localhost:3000/api/health
# 200 — {"status":"ok"}

curl -s -w "%{http_code}\n" http://localhost:3000/api/ready
# 200 — DB + Redis green
```

---

## Part 3 — Internal / non-user-facing testing

These are the contracts that no user clicks but every user-facing
feature relies on. Mostly vitest specs; one curl recipe each for the
cron / health endpoints.

### A. Idempotency on `bookings.create`

```bash
pnpm test:run src/trpc/__tests__/bookings-create.test.ts
```

Locks: double-click submit produces 1 row; 3 concurrent retries with the same key resolve to 1 row; race window inside the transaction caught by the inside-tx re-check.

### B. BookingAudit (decoupled from Booking)

```bash
pnpm test:run src/trpc/__tests__/bookings-cancel.test.ts
pnpm test:run src/trpc/__tests__/audit.test.ts
```

Locks: every state change writes an audit row in the same transaction; audit rows have NO foreign key to Booking (survive deletion); `operationId` correlates cascading writes (audit + webhook delivery share the same id).

### C. Rate limiting

```bash
pnpm test:run src/trpc/__tests__/rate-limit.test.ts
pnpm test:run src/trpc/__tests__/api-keys.test.ts
```

Locks: in-memory limiter respects bucket name + IP; 11th call in 60s returns `TOO_MANY_REQUESTS`; per-key limiter on `/api/v1/*` hits 429 with proper headers at 61st call.

### D. Webhooks (fan-out + HMAC + retry)

```bash
pnpm test:run src/trpc/__tests__/webhooks.test.ts
pnpm test:run src/trpc/__tests__/webhook-cron.test.ts
```

Locks: `WebhookSubscription` lookup by event; HMAC-SHA256 over the raw body with the subscription secret; cron processes Tasks with attempts < maxAttempts; permanent-fail past maxAttempts; `referenceUid` dedup index honored.

### E. Soft delete + cleanup cron

```bash
pnpm test:run src/trpc/__tests__/cleanup-bookings-cron.test.ts
```

Locks: 30-day retention semantics; deleted rows past retention get hard-deleted; audit rows for those bookings survive.

### F. SSE bus

```bash
pnpm test:run src/trpc/__tests__/bus.test.ts
```

Locks: `emitBookingEvent` reaches every active subscription; `iterateBookingEvents` yields events as they arrive; per-host filtering.

### G. Attribution `?ref=`

```bash
pnpm test:run src/trpc/__tests__/attribution.test.ts
```

Locks: edge middleware writes the cookie (HttpOnly, Path=/, 30d, Lax); validates value against `/^[a-zA-Z0-9._-]{1,64}$/`; `bookings.create` reads via `ctx.cookies.get` and writes to `Booking.referrer`.

### H. Feature flags

```bash
pnpm test:run src/trpc/__tests__/feature-flags.test.ts
```

Locks: no-row → default; row enabled=false → off; row enabled=true with no UserFeatures → globally on; row enabled=true with UserFeatures → only assigned users.

### I. Env validation

Drop a typo into `.env`:

```bash
echo 'CRON_SECRT=wrong' >> .env  # typo
pnpm build
# fails at build with "Invalid env" before any code runs
```

### J. Timezone + DST

```bash
pnpm test:run src/trpc/__tests__/timezone.test.ts
```

Locks: IANA validation; DST cusp slot generation (March US, October EU); host-zone vs visitor-zone rendering.

### K. Calendar busy-time merge + two-way write

```bash
pnpm test:run src/trpc/__tests__/calendar.test.ts
pnpm test:run src/trpc/__tests__/calendar-integration.test.ts
pnpm test:run src/trpc/__tests__/calendar-cron.test.ts
```

Locks: `subtractBusyTimes` half-open interval semantics; mocked-adapter integration through the full chain (busy → suppress slot); cron-driven `createEvent` / `updateEvent` / `deleteEvent` against mocked Google + Outlook.

### L. Workflows engine

```bash
pnpm test:run src/trpc/__tests__/workflows.test.ts
```

Locks: workflow CRUD; trigger × action validation; default-row backfill at register; cron-side dispatch to email Task vs webhook Task.

### M. Workspaces + scopes + invitations + lifecycle

```bash
pnpm test:run src/trpc/__tests__/workspaces-scopes.test.ts
pnpm test:run src/trpc/__tests__/workspaces-invitations.test.ts
pnpm test:run src/trpc/__tests__/workspaces-lifecycle.test.ts
pnpm test:run src/trpc/__tests__/workspace-lifecycle.test.ts
```

Locks: scope matrix per role; invite flow (email enqueue + token + expiry + accept); Resend rotates token; updateInvitationRole respects role rules; bulk `inviteMany` all-or-nothing; rename + delete + leave + transferOwnership lifecycle including last-owned-workspace + owner-leave guards.

### N. API keys (token format + scopes + bearer auth)

```bash
pnpm test:run src/trpc/__tests__/api-keys.test.ts
```

Locks: `oh_<nanoid24>` format; sha256+salt hashing; timing-safe comparison; scope subset enforcement; per-key rate-limit headers.

### O. Active-workspace context (B.PT6)

```bash
pnpm test:run src/trpc/__tests__/active-workspace.test.ts
```

Locks: pure parser (valid / invalid / missing); `workspaces.list` returns `isActive: true` on the matching row; falls back to first row on stale or unset cookie.

### P. Round-robin host pick

```bash
pnpm test:run src/trpc/__tests__/round-robin.test.ts
pnpm test:run src/trpc/__tests__/round-robin-integration.test.ts
```

Locks: priority + weight tier picking; id-sort tiebreak; recentAssignments increments after a successful pick; calendar-busy hosts excluded (B.PT12).

### Q. Plan-gating sweep

```bash
pnpm test:run src/trpc/__tests__/plan-gating.test.ts
pnpm test:run src/trpc/__tests__/billing.test.ts
pnpm test:run src/trpc/__tests__/billing-procedures.test.ts
```

Locks: FREE plan rejects `webhooks.create` / `apiKeys.create` / `workflows.create` / member-cap-overflow on invite; `requireFeature` / `memberCap` / `hasFeature` matrix correctness; Stripe webhook signature verification; `billing.{currentPlan,startCheckout,openPortal}` workspace-scope gating.

### R. Account deletion + audit survival

```bash
pnpm test:run src/trpc/__tests__/account-deletion.test.ts
```

Locks: typed-email match; cascade on user record; audit rows preserved (orphaned `bookingUid`).

### S. Test factories (themselves under test)

```bash
pnpm test:run src/trpc/__tests__/test-factories.test.ts
```

Locks: `createTestUser` / `createTestBooking` / `createTestWebhookSubscription` / `createTestBookingAudit` shape correctness.

### T. Health + readiness endpoints

```bash
pnpm test:run src/trpc/__tests__/health-endpoints.test.ts
```

Locks: liveness 200 unconditionally; readiness 503 when DB query fails (mocked via `vi.spyOn(prisma, "$queryRaw")`).

### U. Email templates registry + reminder swap

```bash
pnpm test:run src/trpc/__tests__/reminder.test.ts
```

Locks: schedule on confirmation; cancel on cancellation; swap on reschedule; default Workflow row backfill at register supersedes the hardcoded enqueue.

### V. Admin operator surface

```bash
pnpm test:run src/trpc/__tests__/admin.test.ts
```

Locks: `OFFICEHOURS_ADMIN_HANDLES` env gate; FORBIDDEN for non-admins; flag toggle audit trail.

### W. Cron endpoints (auth + idempotency)

```bash
# Cron auth — secret unset → 401
curl -s -X POST -w "%{http_code}\n" \
  http://localhost:3000/api/cron/process-tasks
# 401

# With secret
curl -s -X POST -w "%{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/process-tasks
# 200 — { processed: <N> }
```

### X. CI gates

The `commit-msg` hook + `BACKLOG.md` SoT:

```bash
# Hook test 1 — no IDs in message → passes
echo "chore: smoke test" > /tmp/msg
.githooks/commit-msg /tmp/msg && echo PASS

# Hook test 2 — ID without BACKLOG.md staged → fails
echo "feat(billing): close B7" > /tmp/msg
.githooks/commit-msg /tmp/msg
# exit=1 with friendly rejection
```

CI workflow runs `lint + typecheck`, `vitest`, `playwright` in parallel jobs. All three must be green for branch protection to allow merge.

### Y. Full suite + lint + types

```bash
pnpm tsc --noEmit
pnpm lint
pnpm test:run
pnpm exec playwright test
```

Current state: 42 vitest files / 342 tests / 2 skipped, 0 lint errors, tsc clean.

---

## Notes

- `BACKLOG.md` is the only place where row status changes. Update it in the same commit that ships a deferral close.
- `AGENTS.md` carries the cross-agent rule that propagates to Codex / Cursor / Copilot / Windsurf / Amp / Devin / Jules. Claude Code reads `CLAUDE.md` which references AGENTS.md.
- Long-form deferral / decision docs live under `docs/` (`C5-cache-aside-deferred.md`, `cli-design.md`, `implementer-agent-prompt.md`).
- Per-domain rules + conventions live under `.claude/rules/` (Claude-only) and as nested `AGENTS.md` files (cross-agent) in source subdirectories.

If a feature shipped that this doc doesn't list, the most likely cause is it landed after this doc was last regenerated. The single source of truth is `BACKLOG.md` + `git log --no-merges`.
