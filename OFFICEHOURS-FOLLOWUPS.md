# Officehours — Follow-ups (Post Tier C)

This is the next working backlog. It is a peer to
[`OFFICEHOURS-DEPTH-IDEAS.md`](./OFFICEHOURS-DEPTH-IDEAS.md) and follows
that doc's format and discipline. The mental model still lives in
[`OFFICEHOURS-PROJECT-GUIDE.md`](./OFFICEHOURS-PROJECT-GUIDE.md). Read
those first.

This file exists because the depth-ideas doc's Tier A (15), Tier B (4),
and Tier C (6) are now **landed in code**, with the same caveats and
deferrals their original implementation commits captured in the
`WHAT'S DEFERRED` blocks. A sequential audit of every commit between
`60c7e25` (item 1, idempotency) and `2ffca4e` (the latest fix) extracted
those blocks plus the implicit deferrals scattered across other commits.
This doc collects them in one place, ranks them by leverage, and
groups them into a tiered backlog matching the depth-ideas convention.

The user instruction during the audit was "list every deferred item
verbatim." So nothing has been smoothed over. If a commit said "real
work; deferred to keep this commit's blast radius bounded" — that
sentence is in the reference section here, attributed to its commit.

The priority hasn't changed: **build inward, not outward**. Production
hardening (security, gate enforcement, type cleanliness) before
multi-tenant completion. Multi-tenant completion before further feature
breadth. The project's identity (small surface, deep stack) still
rules.

---

## Table of Contents

1. [Status Check](#1-status-check)
2. [The Gap That Remains](#2-the-gap-that-remains)
3. [Tier A — Inward Hardening (each ≤ 1 week)](#3-tier-a--inward-hardening-each--1-week)
4. [Tier B — Multi-tenant Completion (each ≥ 1 week)](#4-tier-b--multi-tenant-completion-each--1-week)
5. [Tier C — Long Tail (gated on signal)](#5-tier-c--long-tail-gated-on-signal)
6. [Reference Index — Commits + their deferral text](#6-reference-index--commits--their-deferral-text)
7. [What NOT to Chase](#7-what-not-to-chase)
8. [The Half-Revert Question](#8-the-half-revert-question)

---

## 1. Status Check

A fresh sequential audit of every commit between `60c7e25^..HEAD`
(99 commits) confirms:

- **§10.1 items 1–10**: shipped with tests and instrumentation.
- **Tier A 1–15**: shipped (email, env, timezone, account-deletion,
  i18n, onboarding, reschedule, reminder, admin, logger, cleanup-cron,
  test-factories, theme, error-pages, health/ready).
- **Tier B 1–4**: shipped — workspaces (`2306114`), public API + keys
  (`7df9072`), calendar busy-time sync (`ef65c97`), workflows engine
  (`1dbab8b`).
- **Tier C 1–6**: 5 shipped (embed `07bd093`, billing `6d37510` —
  currently mid-revert, round-robin algorithm `6307d5b`, magic-link
  `8f9bde3`, status page `29787cc`); C5 cache-aside deliberately
  deferred per `6bace63` and `docs/C5-cache-aside-deferred.md`.
- **Recent surface batch**: 5 PRs (workspace-aware bookings, settings
  Workflows / API keys / Calendar UI sections, /login magic-link form)
  closed Tier B/C UI debt that the original implementation commits had
  flagged as "thin React layer that lands separately."
- **Recent fixes**: redirect-after-magic-link, default availability
  seeding, theme tri-state cycle, settings page width tighten,
  segmented-tab alignment, workspace slug 30-char fix, settings
  prefetch tuning.

**Standing gaps** (the next backlog, captured below):

- `src/lib/billing.ts` is in a half-revert state: tsc errors that other
  tests step around. Pre-existing since the C2 rollback started.
- Calendar OAuth tokens persist as plaintext in `CalendarCredential`.
  The original commit explicitly noted "future hardening pass."
- Plan-feature matrix exists in code; **no procedure consults it**.
  `workspaces.invite` doesn't cap at `memberCap(plan)`,
  `webhooks.create` doesn't check `hasFeature(plan, "webhooks")`.
- `Booking` migrated to be workspace-scoped (PR #6); `WebhookSubscription`
  and `BookingAudit` did not. The multi-tenant story is half-done.
- `HostPool` / `EventTypeHost` schema missing — the round-robin
  algorithm landed (`6307d5b`) but has no DB shape to operate on.
- A8's hardcoded reminder enqueue and B4's workflows engine both fire
  identical reminders — the original B4 commit promised a migration
  to a default `Workflow` row, deferred for blast-radius reasons.

---

## 2. The Gap That Remains

The §10.1 work made the booking *loop* production-grade. The Tier A/B/C
work added the surface around it (email, i18n, timezones, settings,
admin, public API, calendar sync, workflows, embed, billing, status).

What's missing now is everything that turns "shipped with deferrals"
into "shipped and complete":

1. **Production hardening** — finish billing decisively, encrypt
   calendar tokens, enforce the plan matrix at procedure boundaries.
   This is unglamorous and load-bearing. Three small wins (each ≤ 1
   day) that move the project from "demonstrably deferring real
   security" to "honest about its hardening state."
2. **Multi-tenant completion** — extend the workspace-aware refactor
   from `Booking` to `WebhookSubscription` and `BookingAudit`. Mint
   the `HostPool` schema so round-robin can actually be used. Wire
   Stripe checkout + portal so billing has a real story end-to-end.
3. **Feature breadth and polish** — multi-step workflows, two-way
   calendar write, embed prerender, status-page telemetry. Each is
   real work; none is the most leveraged next thing.

Tier A below is the hardening layer. Tier B is multi-tenant
completion. Tier C is long-tail polish that pays off when the
respective signal arrives (real billing, real calendar two-way demand,
real prod traffic that justifies cache-aside).

---

## 3. Tier A — Inward Hardening (each ≤ 1 week)

The goal of Tier A: every deferral that introduces real risk inside the
existing shape of the app. Nothing here grows the schema. Each item is
shippable on its own and pays off independently.

| # | Item | Origin commit | LOC | Time |
|---|------|---------------|-----|------|
| A1 | Resolve `billing.ts` half-revert (decide direction) | `6d37510` (rollback in progress) | ~80 (revert) or ~200 (finish) | half day |
| A2 | Calendar token-at-rest encryption via Prisma middleware | `ef65c97` | ~120 | 1 day |
| A3 | Plan-gating sweep through procedures (`hasFeature`, `memberCap`) | `6d37510` | ~80 | 1 day |
| A4 | A8 → default `Workflow` row at register (drop hardcoded reminder) | `1dbab8b` | ~60 | half day |
| A5 | Per-key rate limiting on `/api/v1/*` | `7df9072` | ~50 | half day |
| A6 | Mocked-adapter integration test for calendar full chain | `ef65c97` | ~80 | 2h |
| A7 | Scalar UI for `/api/v1/openapi.json` | `7df9072` | ~30 | 2h |
| A8 | `WORKSPACE_SLUG_MAX` module unification | `2ffca4e` | ~10 | 30 min |

**Why this order:** A1 is gating — `tsc` carries pre-existing errors
that other commits step around, and any new billing work is blocked on
a direction decision. A2 is the highest real-security item on the list.
A3 cashes in the matrix that A1 made stable; this is the cleanest
demonstration of how billing intersects with permissions, called out
explicitly in `OFFICEHOURS-PROJECT-GUIDE.md` as a learning moment.

A4 removes a legitimate code smell: A8's hardcoded reminder Task
enqueue and B4's workflows engine both fire identical reminders if a
user creates a `BEFORE_EVENT` workflow. A5–A8 are bounded polish each
under a day.

### Notes on individual items

**A1 — Resolve `billing.ts` half-revert.** The C2 commit (`6d37510`)
landed Stripe schema + signed webhook + plan-feature matrix. A
subsequent rollback removed the `Subscription` and `StripeEvent` Prisma
models from the generated client but left their imports + usages in
`src/lib/billing.ts` and `src/app/api/stripe/webhook/route.ts`. This is
why `pnpm tsc --noEmit` shows pre-existing errors that gate-passing
commits document as "OK to leave."

This is technically two roads:
1. **Roll forward** — restore the models in `prisma/schema.prisma`,
   re-run `pnpm prisma generate`, fix any drift in the handler. Takes
   ~half day if no API drift since.
2. **Roll back fully** — delete `src/lib/billing.ts` +
   `src/app/api/stripe/webhook/route.ts`, drop the `Subscription` /
   `StripeEvent` schema entries from the schema (already gone from the
   client), drop `src/trpc/__tests__/billing.test.ts`. Takes ~2h.

Either way, `tsc --noEmit` returns clean and any new billing work
starts from a known state. Pick a direction. Don't keep this open.

**A2 — Calendar token-at-rest encryption.** From `ef65c97` verbatim:
"Token-at-rest encryption — cal.com encrypts via Prisma middleware. We
persist plain text under the assumption the DB is itself trust-bounded.
Future hardening pass."

The future is now. `CalendarCredential.accessToken` and `refreshToken`
are sufficient to impersonate the user's Google or Microsoft calendar
account. Anyone with read access to `dev.db` (and, in production,
anyone with read access to whatever Postgres replaces it) holds those
keys.

Cal.com's pattern in `/packages/lib/server/serverConfig.ts` +
`/packages/prisma/middleware`: encryption applied at the Prisma client
level, transparent to callers. Use `node:crypto` AES-256-GCM with a
key from `env.CALENDAR_TOKEN_KEY` (a 32-byte hex string). Migration
re-encrypts existing rows in a one-shot script.

Test path: encrypt → write → read → decrypt round-trip in a vitest
unit. Fail loudly if `env.CALENDAR_TOKEN_KEY` is missing.

**A3 — Plan-gating sweep.** From `6d37510` verbatim: "Plan-gating in
existing procedures (`workspaces.invite` caps at `memberCap`,
`webhooks.create` requires `hasFeature(plan, "webhooks")`, etc.).
Matrix is in place; wiring it through every gate is a follow-up sweep."

Audit candidates (procedures that should consult the matrix once A1
unblocks billing):

- `workspaces.invite` — cap at `memberCap(plan)`; emit a clear error.
- `webhooks.create` — `hasFeature(plan, "webhooks")` gate.
- `workspaces.apiKeys.create` — same pattern, scope to `api-keys`.
- `workflows.create` — `hasFeature(plan, "workflows")`.
- `calendar.authUrl` — `hasFeature(plan, "calendar-sync")`.
- `bookings.create` — host's plan only constrains via member cap; not
  an explicit gate but worth a comment confirming the intent.

The sweep adds ~10 lines per gate plus a contract test asserting the
gate fires for the wrong-plan case. Total ~80 LOC across 5–6 procedures.

**A4 — A8 → default `Workflow` row at register.** From `1dbab8b`
verbatim: "Full migration of A8 to a default workflow row at user
create time — A8's hardcoded reminder still ships universally; making
it user-editable means seeding a default `Workflow` on register +
suppressing the hardcoded enqueue when the row exists. Real work;
deferred to keep this commit's blast radius bounded."

Implementation:
1. Extend `auth.register` + `bootstrapUserWorkspace` (`src/lib/auth-events.ts`)
   to also seed a default `Workflow` row: `trigger: BEFORE_EVENT`,
   `offsetMinutes: 60`, `action: EMAIL_VISITOR`,
   `template: "booking-reminder"`, `active: true`.
2. In `bookings.create`, check whether the host has any active
   `BEFORE_EVENT` workflow row that targets the visitor. If yes, the
   workflows engine handles it; if no, fall back to A8's hardcoded
   enqueue.
3. Backfill migration: insert one default workflow row per existing
   user who has zero `Workflow` rows.

Same shape as the default-availability backfill landed in `45c5722`.

**A5 — Per-key rate limiting on `/api/v1/*`.** From `7df9072` verbatim:
"Per-key rate limiting — for now the existing IP-based limiter covers
`/api/v1` paths. Future: a per-keyId bucket on top."

`src/lib/rate-limit.ts` already has the bucketed-by-key shape used by
the IP limiter. Extend `createRateLimitMiddleware` to take a key
extractor; for `/api/v1/*` routes the extractor reads `req.headers.get
("authorization")` and hashes the bearer token. Per-key budgets so two
integrations from the same IP get independent limits.

**A6 — Mocked-adapter integration test for calendar.** From `ef65c97`
verbatim: "Mocked-adapter integration test of full subtract → slot
suppression flow. Tests here cover the pure merge semantics in
isolation; an integration test with a fetch mock would exercise the
full chain."

One vitest spec that:
1. Seeds a host with a `CalendarConnection` row.
2. Mocks `fetch` to return a known busy-time array from the Google
   adapter URL.
3. Calls `schedule.getUpcomingSlots` for that host.
4. Asserts the suppressed slot is missing from the result.

~80 LOC. Closes the pure-vs-integration gap in B3's test coverage.

**A7 — Scalar UI for `/api/v1/openapi.json`.** From `7df9072` verbatim:
"Scalar / Stoplight UI rendering of the spec — JSON contract is what
matters; rendering is mechanical."

Drop in `@scalar/api-reference-react` at `/api/v1/docs`. Single page,
points at `/api/v1/openapi.json`, gets a polished interactive UI for
free. ~30 LOC.

**A8 — `WORKSPACE_SLUG_MAX` module unification.** From `2ffca4e`
verbatim: "A TODO worth thinking about: pull `WORKSPACE_SLUG_MAX` into
the same module that owns the schema and the helper so all three are
mechanically tied."

Today the constant lives in `src/lib/workspaces.ts` and the zod
schema's `.max(30)` is hardcoded in `src/trpc/routers/workspaces.ts`.
Replace the hardcoded literal with a reference to the constant. ~10
LOC, 30 minutes, prevents future drift.

---

## 4. Tier B — Multi-tenant Completion (each ≥ 1 week)

The goal of Tier B: finish the multi-tenant story Tier B started. PR #6
migrated `Booking` to carry `workspaceId`. The other surfaces that
depend on workspace identity didn't move with it. These items close
that gap.

### B1. Workspace-aware webhooks + audit

The PR that introduced workspace scoping (`9eb0f0f`, also referenced as
the §10.1 follow-up) migrated `Booking.workspaceId` non-null with a
backfill. `WebhookSubscription` and `BookingAudit` still hang off
`User.id` exclusively.

The inconsistency: a workspace OWNER sees every member's bookings
(correct, scoped through the workspace), but webhooks fired from those
bookings are owned by the host User, not the workspace. A workspace
OWNER can't see what webhooks their members have configured. Audit
rows for cross-member booking activity aren't reachable through
workspace-level queries.

**Migration:**
1. Add `WebhookSubscription.workspaceId` nullable, backfill from
   `User.ownedWorkspaces[0].id` for every existing row, then ALTER to
   NOT NULL. (Same shape as the workspace-aware-bookings migration.)
2. Add `BookingAudit.workspaceId` — denormalized, copied at write time
   from `Booking.workspaceId`. Audit rows survive Booking deletion, so
   the workspace pointer must live on the audit row directly.
3. Update `webhooks.list` / `webhooks.create` / `webhooks.delete` to
   take a `workspaceSlug` input and gate via `requireMembership(slug,
   userId, "webhooks.write")`.
4. Add `audit.listForWorkspace(slug)` procedure for OWNER/ADMIN-level
   audit views.

LOC: ~250. Time: 2 days. Reference shape: cal.com's
`Membership/Team` permissions surface around webhook resources.

### B2. `HostPool` / `EventTypeHost` schema + booking flow integration

From `6307d5b` verbatim: "HostPool / EventTypeHost schema. Booking
still hangs off a single User via `Booking.hostId`; no event types
exist; no multi-host workspaces own bookings yet. The B1 commit
deferred this refactor and C3's integration follows that chain."

The round-robin algorithm in `src/lib/round-robin.ts` is
fully-implemented and unit-tested (priority, weight, fixed/pool tiers).
**It can't be used** — there's no schema for "this workspace has
multiple hosts who can be assigned to a booking." The algorithm is
dead code until this lands.

**New schema:**
```prisma
model EventType {
  id          String  @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  name        String  // "30-min consult", "Office hours"
  durationMins Int
  hosts       EventTypeHost[]
}

model EventTypeHost {
  id           String  @id @default(cuid())
  eventTypeId  String
  eventType    EventType @relation(fields: [eventTypeId], references: [id], onDelete: Cascade)
  userId       String
  user         User @relation(fields: [userId], references: [id], onDelete: Cascade)
  isFixed      Boolean @default(false)  // must be present (cal.com)
  priority     Int     @default(2)       // 0–4, higher wins
  weight       Int     @default(1)       // distribution weighting
  recentAssignments Int @default(0)      // for fairness lookback
  @@unique([eventTypeId, userId])
}
```

**Booking flow change:** `bookings.create` takes an `eventTypeSlug`
(already implicit via the URL today, just routed through `User.handle`).
Resolve `EventType` → run `selectHostFromPool(eventType.hosts,
excludeHostIds, lookbackWindow)` → assign result to `hostId`.

For backwards compat: existing `User.handle`-keyed routes still work,
with each User implicitly having an `EventType` that lists themselves
as the only fixed host. Migration creates that singleton row per User.

LOC: ~600 (schema + migration + booking flow + tests). Time: 1 week.

### B3. Stripe checkout + customer portal procedures

From `6d37510` verbatim: "Live checkout / customer-portal session
creation. The webhook receives + persists state; minting a checkout
session needs a Stripe.com account + product config. Add when shop
story lands."

This is gated on the **decision** to actually offer paid plans (not on
A1 — but A1 unblocks the code state). When that decision arrives:

1. Create products + prices in Stripe dashboard. Stash IDs in
   `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` env vars (already validated
   in `src/env.ts`).
2. Add `billing.startCheckout` procedure: takes a target plan slug,
   returns the Stripe Checkout Session URL. The webhook handler
   already persists `Subscription` rows on the success event.
3. Add `billing.openPortal` procedure: returns a Stripe Customer Portal
   session URL for the workspace's existing customer.
4. Add `BillingFields` to `/settings`: current plan badge, "Upgrade" or
   "Manage" button, scope-gated by `workspace.write`.

Time: ~3 days code-wise. Same Stripe-account lead time as setting up
products initially.

### B4. Calendar two-way write

From `ef65c97` verbatim: "Two-way write — creating Google Calendar /
Outlook events from `booking.created` and updating/cancelling on
reschedule + cancel. The adapter interface deliberately doesn't yet
declare `createEvent`/`updateEvent`/`deleteEvent` so it stays tight to
the read use case."

Most users expect that booking against `/h/<handle>` writes the event
to the host's connected Google or Outlook calendar. Today it only
*reads* busy times from the calendar; nothing is written.

**Adapter interface extension:**
```ts
// src/lib/calendar/adapter.ts
export interface CalendarAdapter {
  // Existing read methods …
  fetchBusyTimes(args: BusyArgs): Promise<BusyRange[]>;
  listCalendars(): Promise<CalendarMetadata[]>;
  // New write methods …
  createEvent(args: EventCreateArgs): Promise<{ externalId: string }>;
  updateEvent(externalId: string, args: EventUpdateArgs): Promise<void>;
  deleteEvent(externalId: string): Promise<void>;
}
```

**Booking flow integration:**
- `bookings.create` → after the booking row commits, enqueue a `Task`
  with `type: "calendarWrite"` carrying `{ bookingPublicUid, action:
  "create" }`. The cron processor invokes `createEvent` on the host's
  primary connected calendar; on success, persists the returned
  `externalId` on `Booking.externalCalendarEventId`.
- `bookings.cancel` → enqueue `{ action: "delete" }`.
- `bookings.reschedule` → enqueue `{ action: "update" }`.

Same Task-queue plumbing webhooks and emails already use, so retries +
audit + dedup come for free.

LOC: ~400. Time: 3 days.

### B5. Workspaces UI pages

From `2306114` verbatim: "UI pages — `/workspaces`, `/workspaces/<slug>/
members`, accept page at `/invitations/<token>`. Procedures are tested
+ ready; UI is mechanical."

Today workspace creation, invites, member-management, role changes are
all callable via the tRPC console but invisible from the dashboard.
Three thin pages:

1. `/workspaces` — list user's workspaces, "Create workspace" CTA.
2. `/workspaces/<slug>/members` — role assignment, invite form, pending
   invitations table.
3. `/invitations/<token>` — public-ish accept page (auth required, but
   the token authorizes which workspace).

Mostly composition over the brutalist primitives; same pattern as
`/settings` Workflows / API keys / Calendar sections.

LOC: ~400. Time: 2 days.

---

## 5. Tier C — Long Tail (gated on signal)

Don't start any of these until at least 3 Tier-A items land and 1
Tier-B item lands. Each is real work; none is the most leveraged next
thing. Several are gated on external signals (real prod traffic, real
billing, real metric sink) rather than on engineering effort.

### C1. Calendar push notifications + circuit breaker

From `ef65c97` verbatim: "Push notifications + circuit breaker — the
cal.com pattern is a `CalendarSubscription` model with sync state
(`syncSubscribedAt`, `syncSubscribedErrorCount`). For v1 we poll busy
times on the public slot query path; subscribing to changes is a
separate surface that lands when traffic justifies the channel ops."

Today every public `/h/<handle>` request fans out to fetch external
calendar busy times. At scale that's expensive and hits provider rate
limits. Push subscriptions (Google's Resource Subscription, Microsoft's
Webhook Subscriptions) avoid the polling cost.

**Schema:**
```prisma
model CalendarSubscription {
  id                       String   @id @default(cuid())
  credentialId             String
  credential               CalendarCredential @relation(fields: [credentialId], references: [id], onDelete: Cascade)
  externalChannelId        String   @unique  // provider's subscription id
  syncSubscribedAt         DateTime
  syncSubscribedExpiresAt  DateTime
  syncSubscribedErrorCount Int      @default(0)
  lastSyncAt               DateTime?
}
```

Renewal cron: refresh subscriptions before they expire. Circuit
breaker: error count > 5 → mark dead, fall back to polling.

LOC: ~500. Time: 1 week. Gated on real prod traffic justifying it.

### C2. Multi-step workflows

From `1dbab8b` verbatim: "Multi-step workflows (cal.com supports rule
chains via `WorkflowStep`). Single-action rules are 90% of the value;
chaining is layered on later."

Today each `Workflow` is single-action: trigger → one action. Chaining
(BEFORE_EVENT → email visitor → 30 min later → fire webhook) is a
power-user feature and a real differentiator from "send a reminder
email" SaaS competitors.

**Schema:** add `WorkflowStep` (one workflow has many steps, each with
its own offset + action + template). Dispatch loop iterates the steps
in order, scheduling each `Task` with cumulative offset.

LOC: ~300. Time: 3 days. Schema migration + dispatch loop change. UI
extends the existing dialog with a step-list field array.

### C3. SMS / Slack / Discord workflow actions

From `1dbab8b` verbatim: "SMS / Slack / Discord actions — only EMAIL_*
+ WEBHOOK_FIRE today. Webhook actions are the escape hatch (a host's
webhook handler can post to anywhere)."

Webhook is a real escape hatch — anyone determined enough wires their
own webhook → Slack endpoint. Native actions are polish, not blockers.
But three providers cover ~all cases:

- **SMS** — Twilio integration, same Task queue shape.
- **Slack** — incoming webhook URL per workspace, basic message
  formatting.
- **Discord** — same shape as Slack, different markdown dialect.

LOC: ~150 per provider. Time: 1 day each. Each is independent and can
ship separately when there's user demand for it.

### C4. Status page — historical charts + per-check telemetry + incidents feed

From `29787cc` verbatim:
- "Historical uptime charts. No third-party uptime store wired yet
  (BetterUptime, UptimeRobot, Vercel built-in). The page notes this in
  the footer; charts land when monitoring lands."
- "Per-check telemetry (last-N-minute success rate, p95 latency). Same
  dependency as historical charts — needs a metric sink that doesn't
  exist locally."
- "Public incidents feed. No incident tracker yet; the page surfaces
  live state only."

All three are gated on the same dependency: a metric sink. Pick one
(BetterUptime is the cheapest, integrates via webhook; Vercel
Observability is integrated but Vercel-locked; UptimeRobot is
free-tier-friendly), wire the export, build the chart component.

LOC: ~200 once the sink is picked. Time: half day code, indeterminate
external setup.

### C5. Embed prerender + command queue + booked event handlers

From `07bd093` verbatim:
- "Prerender — invisible iframe loaded ahead of click; visible on
  trigger. Useful when the embed is hidden behind a button; we don't
  yet support hidden embeds, only inline ones."
- "Command queue — `parent.OH.send({ command, ... })` before the
  iframe is ready. Today the parent only listens; sending commands
  (e.g. 'scroll to date X') needs the queue + the iframe-side
  dispatcher."
- "Booked event handlers — the protocol declares the message shape;
  the iframe doesn't yet emit 'booked' because the confirmation page
  is a separate route. Linking those is a cross-route message + a
  parent-side `onBooked` callback hook."

Useful when the embed is hidden behind a "Book now" button (load ahead
of click for instant render) or when integrating with a parent-side
flow ("scroll to next available date" command, "track conversion on
booking" handler). Today only inline always-visible embeds work.

LOC: ~400 combined. Time: 3 days. Cal.com's
`/packages/embeds/LIFECYCLE.md:1-47` is the full reference.

### C6. Better-auth migration evaluation

From `8f9bde3` verbatim: "Full better-auth migration. The doc names
better-auth for OTP / OIDC / account linking + anonymous→user data
migration. Magic link is one feature out of that list; the rest stay
open questions. Better-auth is a separate decision when 2FA / SSO /
enterprise SSO arrive — not folded into this commit."

Magic-link is wired via next-auth's `http-email` provider today. The
depth-ideas doc names better-auth as the larger surface for OTP, OIDC,
account linking, and anonymous→user data migration (the gem feature
where a visitor who created bookings later signs up gets their
bookings transferred atomically).

This is **decision-first**. Don't migrate until 2FA or SSO arrives as
a real requirement. The migration risk on existing sessions is real
and shouldn't be paid for an aesthetic preference.

### C7. Cache-aside for `/h/[handle]`

From `6bace63` and `docs/C5-cache-aside-deferred.md`. The original
deferral reasoning still holds: don't pre-cache without a measured
slow page. Trigger conditions captured in the deferral doc:

- Measured `/h/<handle>` p95 above 800ms in any environment with load.
- Traffic profile where the same handle gets >5 reads/second sustained.
- Postgres migration introducing a network round-trip that becomes
  measurable.

Until one of those trips, this is the entire deliverable. Reference
implementation when it lands: dub's three-tier
`/apps/web/lib/api/links/cache.ts:17-128` (in-memory LRU → Upstash
Redis → Vercel cache → Postgres).

---

## 6. Reference Index — Commits + their deferral text

Verbatim citations from the `WHAT'S DEFERRED` blocks in each
implementation commit. Use these when deciding whether a follow-up
genuinely tracks a documented commitment vs. a new idea.

### `60c7e25`–`f6972cd` (§10.1 items 1–10)

No structured `WHAT'S DEFERRED` blocks in this range. Item 6 (webhooks)
landed across three commits (`59db28e`, `42e34f9`, `dc8f592`); item 8
(SSE live queue) across two (`ed2510a`, `c4efce7`). Item 5
(observability) landed twice — `b9f4301` for the `withSpan` wrap, then
`091af84` for the Sentry swap. None of these flagged structured
deferrals; the work shipped complete.

### `2306114` — feat(workspaces): foundations

> WHAT'S DEFERRED (reserved for follow-up commits)
>
> - Workspace-aware refactor of bookings / webhooks / audit. Those
>   surfaces stay user-centric for now.
> - UI pages — `/workspaces`, `/workspaces/<slug>/members`, accept page
>   at `/invitations/<token>`. Procedures are tested + ready; UI is
>   mechanical.
> - Plan gating (no billing surface exists yet — see Tier C C2).
> - Data backfill of existing users — new users go through the create
>   flow; existing users without a workspace can call
>   `workspaces.create` themselves.

**Status:**
- Bookings: shipped (PR #6, `9eb0f0f`).
- Webhooks + audit: **outstanding** (B1 above).
- UI pages: **outstanding** (B5 above).
- Plan gating: **outstanding** (A3 above).
- Data backfill: shipped (`20260427043800_workspace_aware_bookings`).

### `7df9072` — feat(api-keys): workspace-scoped API keys + bearer auth + OpenAPI 3.1

> WHAT'S DEFERRED
>
> - Workspace-aware booking / webhook / audit endpoints — the data
>   model still hangs off User, not Workspace. The auth + spec
>   machinery in place ships this commit; resource endpoints land when
>   their respective surfaces migrate.
> - Scalar / Stoplight UI rendering of the spec — JSON contract is
>   what matters; rendering is mechanical.
> - Per-key rate limiting — for now the existing IP-based limiter
>   covers `/api/v1` paths. Future: a per-keyId bucket on top.
> - Admin UI for token management — `workspaces.apiKeys.*` exists, UI
>   to call them lives in the next-tier-down commit.

**Status:**
- Workspace-aware booking endpoints: shipped (PR #6).
- Workspace-aware webhook + audit endpoints: **outstanding** (B1).
- Scalar UI: **outstanding** (A7).
- Per-key rate limiting: **outstanding** (A5).
- Admin UI for tokens: shipped (PR #7 — `/settings` API keys section).

### `ef65c97` — feat(calendar): busy-time sync (Google + Outlook), the spine

> WHAT'S DEFERRED (commits to follow when prod feedback warrants)
>
> - Push notifications + circuit breaker — the cal.com pattern is a
>   `CalendarSubscription` model with sync state. For v1 we poll busy
>   times on the public slot query path; subscribing to changes is a
>   separate surface that lands when traffic justifies the channel ops.
> - Two-way write — creating Google Calendar / Outlook events from
>   `booking.created` and updating/cancelling on reschedule + cancel.
> - Token-at-rest encryption — cal.com encrypts via Prisma middleware.
>   We persist plain text under the assumption the DB is itself
>   trust-bounded. Future hardening pass.
> - Settings UI — adapter layer + procedures are tested and ready; the
>   picker UI on /settings (connect button, calendar list, select
>   toggles) is a thin React layer that lands separately.
> - Mocked-adapter integration test of full subtract → slot suppression
>   flow.

**Status:**
- Push notifications: **outstanding** (C1).
- Two-way write: **outstanding** (B4).
- Token encryption: **outstanding** (A2).
- Settings UI: shipped (PR #5 — `/settings` Calendar section).
- Mocked-adapter test: **outstanding** (A6).

### `1dbab8b` — feat(workflows): user-configurable email + webhook rule engine

> WHAT'S DEFERRED
>
> - Settings UI for rule editing — procedures + tests in place; a
>   `/settings/workflows` page is a thin React layer that lands
>   separately.
> - Full migration of A8 to a default workflow row at user create time
>   — A8's hardcoded reminder still ships universally; making it
>   user-editable means seeding a default Workflow on register +
>   suppressing the hardcoded enqueue when the row exists. Real work;
>   deferred to keep this commit's blast radius bounded.
> - SMS / Slack / Discord actions — only EMAIL_* + WEBHOOK_FIRE today.
>   Webhook actions are the escape hatch.
> - Multi-step workflows (cal.com supports rule chains via
>   `WorkflowStep`). Single-action rules are 90% of the value; chaining
>   is layered on later.

**Status:**
- Settings UI: shipped (PR #8 — `/settings` Workflows section).
- A8 → default row: **outstanding** (A4).
- SMS / Slack / Discord: **outstanding** (C3).
- Multi-step: **outstanding** (C2).

### `07bd093` — feat(embed): iframe-hosted booking widget

> WHAT'S DEFERRED (cal.com's full pattern lands later if traffic
> warrants):
>
> - Prerender — invisible iframe loaded ahead of click; visible on
>   trigger. Useful when the embed is hidden behind a button.
> - Command queue — `parent.OH.send({ command, ... })` before the
>   iframe is ready.
> - Booked event handlers — the protocol declares the message shape;
>   the iframe doesn't yet emit 'booked'.

**Status:** all three **outstanding** (C5, bundled).

### `6d37510` — feat(billing): Stripe schema + signed webhook + plan-feature matrix

> WHAT'S DEFERRED (Stripe account setup is the gating dep)
>
> - Live checkout / customer-portal session creation. The webhook
>   receives + persists state; minting a checkout session needs a
>   Stripe.com account + product config.
> - tRPC procedures for "current plan", "start checkout", "open
>   portal".
> - Plan-gating in existing procedures (`workspaces.invite` caps at
>   `memberCap`, `webhooks.create` requires `hasFeature(plan,
>   "webhooks")`, etc.). Matrix is in place; wiring it through every
>   gate is a follow-up sweep.
> - Customer portal URL helper.

**Status:**
- Half-revert in progress; pre-existing `tsc` errors. **Outstanding —
  decision required** (A1).
- Checkout / portal procedures: **outstanding** (B3).
- Plan gating sweep: **outstanding** (A3).

### `6307d5b` — feat(round-robin): pure host-selection algorithm

> WHAT'S DEFERRED
>
> - HostPool / EventTypeHost schema. Booking still hangs off a single
>   User via `Booking.hostId`; no event types exist; no multi-host
>   workspaces own bookings yet. The B1 commit deferred this refactor
>   and C3's integration follows that chain.
> - Calendar conflict lookup — the `excludeHostIds` set is populated
>   by the caller; integrating with B3's busy-time read so a host with
>   a conflicting calendar event is auto-excluded is mechanical once
>   the booking flow knows which workspace it's booking against.
> - Distribution fairness over the lookback window — recent behavior
>   of cal.com is to track recentAssignments over a 7d/30d window. We
>   treat the value as caller-supplied so the storage policy is the
>   caller's choice.

**Status:** all three rolled into B2 (`HostPool` schema unblocks the
others).

### `8f9bde3` — feat(auth): magic-link sign-in via http-email + Resend

> WHAT'S DEFERRED (deliberately)
>
> - Full better-auth migration. The doc names better-auth for OTP /
>   OIDC / account linking + anonymous→user data migration. Magic link
>   is one feature out of that list; the rest stay open questions.
> - UI on /login. The provider is wired; the form-side "sign in with
>   email" button is a thin React change.

**Status:**
- UI on /login: shipped (PR #4 — magic-link form).
- Better-auth migration: **outstanding — decision required** (C6).

### `29787cc` — feat(status): public /status page with current-state checks

> WHAT'S DEFERRED
>
> - Historical uptime charts. No third-party uptime store wired yet.
> - Per-check telemetry (last-N-minute success rate, p95 latency).
>   Same dependency.
> - Public incidents feed. No incident tracker yet; the page surfaces
>   live state only.

**Status:** all three **outstanding** (C4, bundled — gated on metric
sink decision).

### `2ffca4e` — fix(workspaces): personal slug overflowed 30 chars

> A TODO worth thinking about: pull `WORKSPACE_SLUG_MAX` into the same
> module that owns the schema and the helper so all three are
> mechanically tied.

**Status:** **outstanding** (A8).

---

## 7. What NOT to Chase

This list complements the depth-ideas doc's §7 and the project guide's
§10.2. Specifically post-Tier-C entries:

- **Adding more Stripe webhook event types until A1 lands.** The
  half-revert state means new event handlers would need to import
  models that don't exist on the client. Resolve A1 first.
- **Building Tier C C5 cache-aside speculatively.** The deferral rule
  is firm: no measured slow page, no cache. Re-read
  `docs/C5-cache-aside-deferred.md` if tempted. The invalidation
  contract (9 mutations × multiple cache tiers) is a much bigger
  surface than the cache itself.
- **Adding more locales beyond en/es.** The negotiation infrastructure
  (`9f5073e`) handles N locales; adding Korean or French is a bag of
  translation strings, not engineering. Until there's a real Korean or
  French user, the work doesn't pay off.
- **Replacing next-auth with better-auth speculatively.** The C6
  evaluation is decision-first. Don't migrate until 2FA or SSO is a
  hard requirement. Existing-session migration risk is real.
- **Building "team scheduling UI" before B2 schema lands.** Round-robin
  has no DB shape; building a UI that toggles features on a non-existent
  `EventType.hosts` set is unimplementable. Schema first.
- **Building a "marketing site" / "blog" / "docs site."** This is a
  learning artifact. The README is the marketing. The deferred-work
  docs (this file, depth-ideas, project-guide) are the docs.
- **More dashboard pages without a feature reason.** Settings is dense
  enough as it is. New pages must defend themselves against "add a
  section to /settings instead."

---

## 8. The Half-Revert Question

`src/lib/billing.ts` is the single biggest blocker on this list. It's
two days of "should I roll forward or back" indecision masquerading as
half a day of code work. It blocks:

- A1 (literally itself).
- A3 (plan-gating reads `hasFeature` from billing.ts).
- B3 (Stripe checkout/portal procedures live alongside billing.ts).
- Any new procedure that wants to consult the plan matrix.

The decision matrix:

**Roll forward** if you genuinely want paid plans in the project. Means
restoring `Subscription` and `StripeEvent` to the Prisma schema,
running `prisma migrate dev`, regenerating the client, fixing any drift
in the webhook handler (Stripe SDK API may have moved). The matrix
becomes load-bearing; A3's sweep makes sense; B3's checkout/portal
procedures complete the story.

**Roll back fully** if you don't want the billing complexity right now.
Delete `src/lib/billing.ts`, `src/app/api/stripe/webhook/route.ts`,
`src/trpc/__tests__/billing.test.ts`. Drop the Stripe env vars from
`src/env.ts` (or mark them all `.optional()` and remove their
references). Remove `STRIPE_PRO_PRICE_ID` etc. from `.env.example`.

The middle ground (current state — broken imports + skipped tests +
"OK to leave" caveats in every commit message) costs more than either
direction over time. Pick.

---

## A Final Word

The §10.1 list was the first inflection. The Tier A/B/C work was the
second — Officehours stopped being a single-user toy and started
having multi-tenant primitives, public APIs, calendar sync, billing
infrastructure, an embed widget, a status page, magic-link auth.

This list is the third inflection — the work that turns "shipped with
deferrals" into "shipped and complete." It's the least glamorous of
the three. It also has the highest actual leverage per LOC at this
point in the project's life: every item closes a real gap that the
implementation commits explicitly named.

If you do A1 + A2 + A3 + A4 from Tier A and B1 + B2 from Tier B —
that's 2 weeks of focused work — Officehours becomes the kind of
project that survives a senior code review. If you do all of Tier A
and three Tier B items, the project is defensible at the level of "I
built a small SaaS, here's the production discipline that proves it."

Don't aim higher than that. Tier C is genuinely optional and most of
it is gated on signals (real billing, real prod traffic, real metric
sink) you don't have yet. When those signals arrive, this doc is the
playbook. Until then, hold the line.

Pick A1. Decide it. The rest follows.
