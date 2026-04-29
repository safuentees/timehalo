# Officehours — Open Deferrals (Commit-Level Index)

This is a **current-state snapshot** of every item that an
implementation commit between `60c7e25` (item 1, idempotency) and
`c9df11a` (top bar with workspace switcher, latest) explicitly
deferred and that is **still outstanding today**. It complements
[`OFFICEHOURS-FOLLOWUPS.md`](./OFFICEHOURS-FOLLOWUPS.md) (broader
backlog, includes implicit gaps) and
[`OFFICEHOURS-DEPTH-IDEAS.md`](./OFFICEHOURS-DEPTH-IDEAS.md) (the
template for this file's format).

The audit method was sequential: for each of the 265 commits between
`79126fb` (initial) and HEAD, the body was scanned for `WHAT'S
DEFERRED` blocks, "future ...", "TODO", "next iteration", "follow-up
commit", "stays open", and the like. Every match is captured below,
with the commit hash so you can `git show <hash>` to read the
original wording.

Items the followups doc already tracked have been **cross-checked
against the codebase as of HEAD** — A2/A3/A4/B2/B5 are now shipped
and were dropped from this file's open list. Two new categories
surfaced that the followups doc does **not** cover:

1. Per-commit micro-deferrals from non-major commits (`040a33f`,
   `e583bbc`, `5b8914e`, `1439e7f`) — visitor-side reschedule UI,
   the bookings detail-page polish trio, the event-types
   management page, the orphan calendar-sync plan gate.
2. Two live `TODO()` comments in code (`src/lib/event-types.ts`,
   `src/lib/rate-limit.ts`).

The priority discipline is the same as the depth-ideas doc:
**build inward, not outward**. Multi-tenant consistency before
new feature breadth. Real-security before polish. Decision-first
items (better-auth migration, Stripe checkout) sit in Tier C
because the engineering is gated on a product call you haven't
made yet.

---

## Table of Contents

1. [Status](#1-status)
2. [Tier A — Hardening Open Deferrals (each ≤ 1 day)](#2-tier-a--hardening-open-deferrals-each--1-day)
3. [Tier B — Multi-tenant + Feature Open Deferrals (each 2–5 days)](#3-tier-b--multi-tenant--feature-open-deferrals-each-25-days)
4. [Tier C — Signal-Gated / Decision-First Deferrals](#4-tier-c--signal-gated--decision-first-deferrals)
5. [Live `TODO` Comments in Code](#5-live-todo-comments-in-code)
6. [Reference Index — verbatim per commit](#6-reference-index--verbatim-per-commit)
7. [What NOT to Chase](#7-what-not-to-chase)

---

## 1. Status

A fresh sequential audit of HEAD's commit log confirms:

- **§10.1 items 1–10**: shipped, no open deferrals.
- **Tier A 1–15** (depth-ideas): shipped.
- **Tier B 1–4** (depth-ideas): shipped.
- **Tier C 1–6** (depth-ideas): 5 shipped (embed `07bd093`, billing
  `6d37510`, round-robin algorithm `6307d5b`, magic-link `8f9bde3`,
  status page `29787cc`), C5 cache-aside deferred-by-design.
- **Followups Tier A**: A1/A2/A3/A4/A6 shipped; A5/A7/A8 still open.
- **Followups Tier B**: B2 + B5 shipped; B1/B3/B4/B6 still open.
- **Followups Tier C**: 1, 2, 3 shipped where applicable; rest
  signal-gated.
- **B6 surface completeness**: 9 capabilities tracked, 0 shipped.
- **Recent commits** (`040a33f`, `e583bbc`, `5b8914e`, `1439e7f`)
  introduced new micro-deferrals not in the followups doc.

Counted, the live open-deferral inventory is **25 items** ranged from
30-min cleanups (A8) to 1-week multi-tenant migrations (B1). Most are
≤ 1 day. None has shipped silently — every entry below cites the
exact commit that named it.

---

## 2. Tier A — Hardening Open Deferrals (each ≤ 1 day)

The goal of Tier A: every micro-deferral that's still open, that
doesn't grow the schema beyond 1 column, and that ships within a
day. None of these is glamorous; all of them close a gap an
implementation commit explicitly named.

| # | Item | Origin commit | LOC | Time |
|---|------|---------------|-----|------|
| A1 | `WORKSPACE_SLUG_MAX` module unification | `2ffca4e` | ~10 | 30 min |
| A2 | Scalar UI for `/api/v1/openapi.json` | `7df9072` | ~30 | 2 h |
| A3 | Per-key rate limiting on `/api/v1/*` | `7df9072` | ~50 | half day |
| A4 | Mocked-adapter integration test for calendar full chain | `ef65c97` | ~80 | 2 h |
| A5 | Adjacent-booking prev/next nav on detail page | `e583bbc` | ~40 | 2 h |
| A6 | Webhook delivery list (historical succeeded Tasks) on detail page | `e583bbc` | ~80 | half day |
| A7 | Sheet drawer / intercepted-route variant for `/bookings/[publicUid]` | `e583bbc` | ~120 | 1 day |
| A8 | Resolve the orphan `calendar-sync` plan gate stub | `1439e7f` | ~20 | 1 h |
| A9 | Visitor-facing reschedule UI (Reschedule button on /booked + slot-picker `?reschedule=<uid>` awareness) | `040a33f` | ~80 | 1 day |

**Why this order:** A1 is the cleanest single-line fix in the codebase —
30 min, removes a literal `.max(30)` drift risk. A2 is one Scalar
component drop-in for free polish. A3 is the only one with real
security/billing value. A4 closes the test gap that calendar B3 left
open. A5/A6/A7 polish the one-off bookings detail-page commit. A8
either drops the plan-gate orphan or makes it real.

### Notes on individual items

**A1 — `WORKSPACE_SLUG_MAX` module unification.** From `2ffca4e`
verbatim: *"A TODO worth thinking about: pull `WORKSPACE_SLUG_MAX`
into the same module that owns the schema and the helper so all three
are mechanically tied."* Today the constant lives in
`src/lib/workspaces.ts`; the zod schema's `.max(30)` is hardcoded in
`src/trpc/routers/workspaces.ts:35`. Replace the literal with a
reference to the constant. Done.

**A2 — Scalar UI for `/api/v1/openapi.json`.** From `7df9072`
verbatim: *"Scalar / Stoplight UI rendering of the spec — JSON
contract is what matters; rendering is mechanical."* Add
`@scalar/api-reference-react` at `/api/v1/docs`. Single page, points
at `/api/v1/openapi.json`, gets a polished interactive UI for free.

**A3 — Per-key rate limiting on `/api/v1/*`.** From `7df9072`
verbatim: *"Per-key rate limiting — for now the existing IP-based
limiter covers `/api/v1` paths. Future: a per-keyId bucket on top."*
`src/lib/rate-limit.ts:84` already carries the
`TODO(prod): when UPSTASH_REDIS_REST_URL is set, return the Redis`
comment for the same path. Extend `createRateLimitMiddleware` to take
a key extractor; for `/api/v1/*` the extractor reads
`req.headers.get("authorization")` and hashes the bearer token.

**A4 — Mocked-adapter calendar integration test.** From `ef65c97`
verbatim: *"Mocked-adapter integration test of full subtract → slot
suppression flow. Tests here cover the pure merge semantics in
isolation; an integration test with a fetch mock would exercise the
full chain."* One vitest spec: seed a host with a `CalendarConnection`
row, mock `fetch` to return a known busy-time array from the Google
adapter URL, call `schedule.getUpcomingSlots`, assert the suppressed
slot is missing.

**A5 — Adjacent-booking prev/next nav on `/bookings/[publicUid]`.**
From `e583bbc` verbatim: *"Adjacent-booking prev/next nav. Useful
when the host triages a queue; not load-bearing on first cut."* Two
chevron buttons in the detail-page header that link to the previous
and next bookings in the host's chronological list. Server-side
prefetch the neighbours in `bookings.getDetail`.

**A6 — Webhook delivery list on detail page.** From `e583bbc`
verbatim: *"Webhook delivery list. Deliveries land in the `Task` table
with `referenceUid` matching the booking uid; the side block here
shows pending Tasks but not historical succeeded ones. A 'deliveries'
sub-section is a natural follow-up."* Add a `bookings.listDeliveries`
procedure that queries `Task.referenceUid LIKE $publicUid:%` for
`succeededAt IS NOT NULL` rows. Render a small section under the
audit history with status + duration.

**A7 — Intercepted-route drawer for `/bookings/[publicUid]`.** From
`e583bbc` verbatim: *"Sheet drawer / intercepted route. Modern Next 15
pattern is `(.)bookings/[publicUid]` for drawer-from-list with a
deep-linkable URL. Adds complexity. Ship the full page first, layer
on the intercepted-route drawer in a future commit."* Add the parallel
intercepted route. Hard refresh still routes to the full page; click
from the list opens the drawer with deep-linkable URL.

**A9 — Visitor-facing reschedule UI.** From `040a33f` verbatim:
*"Visitor-facing UI (a Reschedule button on the confirmation page +
host-page slot-picker awareness of `?reschedule=<uid>`) is deferred to
a follow-up commit. The procedure is testable and contract-locked by
7 vitest cases covering swap atomicity, audit linkage, idempotency,
slot collision, no-op rejection, unknown-uid, and email enqueue."*

Verified at HEAD: `src/app/h/[handle]/booked/[bookingUid]/
booking-confirmation.tsx` has **no** Reschedule button; the
`reschedule` procedure exists and is fully tested but the visitor
can't trigger it from the UI. Two pieces:
1. Reschedule button on the booked confirmation page.
2. `/h/[handle]?reschedule=<uid>` awareness in the slot-picker —
   when this query param is present, the picker uses the existing
   booking's slot as a "from" anchor and routes the slot click into
   `bookings.reschedule(uid, newSlot)` instead of `bookings.create`.

**A8 — Resolve orphan `calendar-sync` plan gate.** From `1439e7f`
verbatim: *"calendar.authUrl was on the followups doc's audit list
but skipped intentionally — calendar.connect is in the FREE matrix
already, so gating it is a no-op until a future 'calendar-sync' PRO+
feature is added. The doc's list-item is orphaned, not load-bearing."*
Either (a) delete the orphan from the followups doc's audit list, or
(b) define the `calendar-sync` feature in PLAN_FEATURES and move
`calendar.authUrl` behind it. Pick one and remove the dangling state.

---

## 3. Tier B — Multi-tenant + Feature Open Deferrals (each 2–5 days)

The goal of Tier B: every commit-flagged deferral that's real
engineering — schema migration, new feature surface, or full
multi-tenant migration of an existing surface. Each item closes
work an implementation commit explicitly committed to in writing.

| # | Item | Origin commit | LOC | Time |
|---|------|---------------|-----|------|
| B1 | Workspace-aware `WebhookSubscription` + `BookingAudit` (data + procedures) | `2306114` + `7df9072` | ~250 | 2 days |
| B2 | Calendar two-way write (`createEvent` / `updateEvent` / `deleteEvent`) | `ef65c97` | ~400 | 3 days |
| B3 | Stripe checkout + customer-portal procedures (`billing.startCheckout`, `billing.openPortal`) | `6d37510` | ~200 | 3 days |
| B4 | `/workspaces/<slug>/event-types` host-pool management page | `5b8914e` | ~300 | 2 days |
| B5 | Workspace lifecycle four-pack: rename + delete + leave + transferOwnership | followups B6 | ~400 | 2-3 days |
| B6 | Workspace context switcher (global, cookie-stored) | followups B6 | ~250 | 2 days |
| B7 | `/workspaces/<slug>/settings` page (home for B5 lifecycle actions) | followups B6 | ~200 | 1-2 days |
| B8 | Resend invitation + edit-pending-invite-role procedures | followups B6 | ~80 | half day each |
| B9 | Bulk invite (`workspaces.inviteMany`) | followups B6 | ~120 | 1 day |
| B10 | Multi-step workflows (`WorkflowStep` chains) | `1dbab8b` | ~350 | 3 days |
| B11 | SMS / Slack / Discord workflow actions | `1dbab8b` | ~150 per provider | 1 day each |
| B12 | Calendar conflict lookup → `excludeHostIds` integration with round-robin | `6307d5b` | ~80 | half day |
| B13 | Distribution fairness lookback window (recentAssignments cron decay) | `6307d5b` | ~60 | half day |

**Why this order:** B1 is the most leveraged remaining multi-tenant
work — the inconsistency between workspace-aware `Booking` (PR #6)
and user-scoped `WebhookSubscription` / `BookingAudit` is the
clearest "half-done" gap in the system. B2 is the highest user-facing
impact remaining — most users expect their bookings to land in
Google/Outlook calendar; today only busy-time read works. B3 is
gated on a product decision (do you actually want to charge?) but is
ready to ship code-wise the moment that decision lands. B4 unblocks
multi-host workspaces from the UI side now that B2's schema landed.
B5–B9 are the workspace lifecycle gap the followups doc opened in §B6.
B10–B13 are deferred feature breadth from `1dbab8b` and `6307d5b` —
each shippable independently when a real signal arrives.

### Notes on individual items

**B1 — Workspace-aware webhooks + audit.** Same migration shape as
the workspace-aware-bookings PR (`9eb0f0f`, PR #6): add nullable
`workspaceId` column, backfill from `User.ownedWorkspaces[0].id` for
every existing row, ALTER to NOT NULL. Then update
`webhooks.list/create/delete` to take a `workspaceSlug` and gate via
`requireMembership(slug, userId, "webhooks.write")`. Add
`audit.listForWorkspace(slug)` for OWNER/ADMIN-level audit views.

The inconsistency this closes: a workspace OWNER sees every member's
bookings (correct, scoped through the workspace), but webhooks fired
from those bookings are owned by the host User, not the workspace. A
workspace OWNER can't see what webhooks their members configured.

**B2 — Calendar two-way write.** From `ef65c97` verbatim: *"Two-way
write — creating Google Calendar / Outlook events from
`booking.created` and updating/cancelling on reschedule + cancel.
The adapter interface deliberately doesn't yet declare
`createEvent`/`updateEvent`/`deleteEvent` so it stays tight to the
read use case."*

Adapter extension:
```ts
export interface CalendarAdapter {
  // Existing read methods
  fetchBusyTimes(args: BusyArgs): Promise<BusyRange[]>;
  listCalendars(): Promise<CalendarMetadata[]>;
  // New write methods
  createEvent(args: EventCreateArgs): Promise<{ externalId: string }>;
  updateEvent(externalId: string, args: EventUpdateArgs): Promise<void>;
  deleteEvent(externalId: string): Promise<void>;
}
```
Wire via the existing Task queue (`type: "calendarWrite"`) so retries
+ dedup come for free.

**B3 — Stripe checkout + portal procedures.** From `6d37510`
verbatim: *"Live checkout / customer-portal session creation. The
webhook receives + persists state; minting a checkout session needs a
Stripe.com account + product config. Add when shop story lands."*
Plus: *"tRPC procedures for 'current plan', 'start checkout', 'open
portal'. Schema + read paths exist; the wrappers are mechanical."*
Plus: *"Customer portal URL helper."*

Three procedures: `billing.startCheckout(plan)` returns Stripe
Checkout Session URL; `billing.openPortal()` returns Stripe Customer
Portal URL; `billing.currentPlan()` returns the active
`Subscription` row's plan. Webhook handler already persists the
state on the success event.

**B4 — `/workspaces/<slug>/event-types` page.** From `5b8914e`
verbatim: *"NOT in this commit — workspace OWNERs can populate
`EventTypeHost` rows directly via Prisma Studio for now. The
`/workspaces/<slug>/event-types` surface is a future commit; ships
its own scope."*

Mirror `/settings` structure: page lists EventTypes per workspace +
"Add event type" button + per-event-type members editor (the
EventTypeHost rows with priority/weight/isFixed toggles). Round-robin
algorithm consumes these directly — already wired since `5b8914e`.

**B5 — Lifecycle four-pack.** Rename + delete + leave + transfer
ownership procedures. Each is one tRPC mutation + one
`<ConfirmDialog>`. Transfer ownership wants a recipient-confirms step
— mint an invitation-token-shaped one-shot token, recipient accepts
via `/invitations/<token>?action=transfer-ownership`. Group the four
together so the workspace settings page (B7) has somewhere
meaningful to put them.

**B6 — Workspace context switcher (global).** The dashboard top bar
shipped in `c9df11a` displays the user's primary workspace and a
dropdown that navigates to `/workspaces/<slug>/members` per item, but
**doesn't switch global state**. Today only `/settings` API keys has
a true workspace dropdown. Build a cookie-stored selection (or
Zustand-style global), reuse across every host page. The trigger
already exists; the back-end work is the cookie + tRPC context
threading.

**B7 — `/workspaces/<slug>/settings` page.** Natural home for B5
lifecycle actions, plus future billing tab (B3), member-cap status,
invite defaults. Mirrors the existing `/settings` structure: dense
sub-sections, per-section save. ~1-2 days once B5 lifecycle
procedures land.

**B8 — Resend invitation + edit pending invitation role.** Two thin
procedures. Resend = revoke-and-recreate-with-rotated-token wrapped in
one transaction; preserves the email + role. Edit-role = single-line
update on `Invitation.role` if the caller passes the scope check.

**B9 — Bulk invite (`workspaces.inviteMany`).** Server today takes
one email at a time. New procedure accepts an array; per-row
plan-cap check inside a transaction so 4 of 5 don't accidentally land
when the 5th would overflow `memberCap(plan)`. Same notification +
Task enqueue as single-invite.

**B10 — Multi-step workflows (`WorkflowStep` chains).** From
`1dbab8b` verbatim: *"Multi-step workflows (cal.com supports rule
chains via `WorkflowStep`). Single-action rules are 90% of the value;
chaining is layered on later."* New `WorkflowStep` schema per
existing `Workflow` row, ordered by `index`. Dispatcher iterates the
steps in order. Cal.com pattern reference:
`/packages/features/ee/workflows/lib/reminders/`.

**B11 — SMS / Slack / Discord workflow actions.** From `1dbab8b`
verbatim: *"SMS / Slack / Discord actions — only `EMAIL_*` +
`WEBHOOK_FIRE` today."* Each is its own provider integration, ~150
LOC + tests. Twilio for SMS, Slack incoming webhooks, Discord webhook
URLs (no OAuth). Each ships independently.

**B12 — Calendar conflict lookup integration.** From `6307d5b`
verbatim: *"Calendar conflict lookup — the `excludeHostIds` set is
populated by the caller; integrating with B3's busy-time read so a
host with a conflicting calendar event is auto-excluded is mechanical
once the booking flow knows which workspace it's booking against."*

Now that B2 from depth-ideas is shipped (round-robin schema), the
booking flow knows which workspace + event-type it's booking against.
Iterate the host pool, call `fetchBusyTimes` per host's calendar,
populate `excludeHostIds` with anyone busy at the requested slot.
Pass to `selectHost`.

**B13 — Distribution fairness lookback window.** From `6307d5b`
verbatim: *"Distribution fairness over the lookback window — recent
behavior of cal.com is to track `recentAssignments` over a 7d/30d
window. We treat the value as caller-supplied so the storage policy
is the caller's choice."*

A daily cron decays `EventTypeHost.recentAssignments` (subtract
assignments older than the lookback window, or implement as a
window-query rather than a counter). Cal.com pattern reference:
`/packages/features/ee/round-robin/`.

---

## 4. Tier C — Signal-Gated / Decision-First Deferrals

These deferrals are real, but the engineering is **not the next thing
to do**. Either an external signal hasn't arrived (real prod traffic,
real metric sink), a product decision hasn't been made (paid plans,
SSO requirements), or a dependency hasn't matured (Postgres migration).

| # | Item | Origin commit | Gating dependency |
|---|------|---------------|-------------------|
| C1 | Calendar push notifications + circuit breaker | `ef65c97` | Real prod traffic justifying channel ops |
| C2 | Status page historical uptime charts | `29787cc` | Pick a metric sink (BetterUptime / Vercel / UptimeRobot) |
| C3 | Status page per-check telemetry (success rate, p95) | `29787cc` | Same metric sink as C2 |
| C4 | Status page public incidents feed | `29787cc` | Pick an incident tracker |
| C5 | Embed prerender (invisible iframe ahead of click) | `07bd093` | A user demands hidden embeds |
| C6 | Embed command queue (`parent.OH.send({...})`) | `07bd093` | A user demands parent-side commands |
| C7 | Embed booked event handlers (`onBooked` callback) | `07bd093` | Cross-route message + parent-side hook |
| C8 | Better-auth migration evaluation | `8f9bde3` | 2FA / SSO / enterprise SSO requirement |
| C9 | Cache-aside for `/h/[handle]` | `6bace63`, `docs/C5-cache-aside-deferred.md` | Measured p95 > 800ms or sustained > 5 reads/s |
| C10 | Postgres-mode CI workflow `prisma migrate diff` | `e33aa19` | Postgres migration itself |

**Why this is Tier C:** C1–C7 are real systems engineering, but each
adds operational surface (a new external integration, a new
dependency, a new contract) that's only worth maintaining when there's
demand to justify it. C8 is decision-first: better-auth's existing-
session migration risk is real and shouldn't be paid for an aesthetic
preference. C9 is explicitly fenced behind measured trigger conditions
in `docs/C5-cache-aside-deferred.md`. C10 is gated on the
dev.db→Postgres move which itself isn't currently planned.

### Notes on individual items

**C1 — Push notifications + circuit breaker.** From `ef65c97`
verbatim: *"Push notifications + circuit breaker — the cal.com pattern
is a `CalendarSubscription` model with sync state
(`syncSubscribedAt`, `syncSubscribedErrorCount`). For v1 we poll busy
times on the public slot query path; subscribing to changes is a
separate surface that lands when traffic justifies the channel ops."*

**C2 / C3 / C4 — Status page extensions.** From `29787cc` verbatim:
*"Historical uptime charts. No third-party uptime store wired yet
(BetterUptime, UptimeRobot, Vercel built-in). The page notes this in
the footer; charts land when monitoring lands."* Same dependency for
per-check telemetry (`last-N-minute success rate, p95 latency`) and
public incidents feed (`No incident tracker yet; the page surfaces
live state only`). All three gate on the same metric/incident-sink
decision.

**C5 / C6 / C7 — Embed widget extensions.** From `07bd093` verbatim:
*"Prerender — invisible iframe loaded ahead of click; visible on
trigger. Useful when the embed is hidden behind a button; we don't yet
support hidden embeds, only inline ones. Command queue —
`parent.OH.send({ command, ... })` before the iframe is ready. Today
the parent only listens; sending commands (e.g. 'scroll to date X')
needs the queue + the iframe-side dispatcher. Booked event handlers —
the protocol declares the message shape; the iframe doesn't yet emit
'booked' because the confirmation page is a separate route. Linking
those is a cross-route message + a parent-side `onBooked` callback
hook."* Cal.com `/packages/embeds/LIFECYCLE.md` is the full
reference.

**C8 — Better-auth migration evaluation.** From `8f9bde3` verbatim:
*"Full better-auth migration. The doc names better-auth for OTP /
OIDC / account linking + anonymous→user data migration. Magic link is
one feature out of that list; the rest stay open questions.
Better-auth is a separate decision when 2FA / SSO / enterprise SSO
arrive — not folded into this commit."*

**C9 — Cache-aside for `/h/[handle]`.** Already documented in
`docs/C5-cache-aside-deferred.md`. Trigger conditions: measured
`/h/<handle>` p95 above 800ms in any environment with load; traffic
profile where the same handle gets > 5 reads/second sustained;
Postgres migration introducing a network round-trip that becomes
measurable. Dub three-tier reference (`/apps/web/lib/api/links/
cache.ts:17-128`) lands when un-deferral lands.

**C10 — Postgres-mode CI workflow `prisma migrate diff`.** From
`e33aa19` verbatim: *"Note for the future: cal.com's
`check-prisma-migrations.yml` runs `prisma migrate diff --exit-code
--from-migrations --to-schema-datamodel --shadow-database-url` to
catch 'edited schema.prisma but forgot migrate dev' before merge.
SQLite can't shadow-DB the same way, so this lands when we go to
Postgres (CAL-LAB-ROADMAP §8 territory)."*

---

## 5. Live `TODO` Comments in Code

Two `TODO` comments are still present in source. Both are tracked by
larger items above; listing them here so a `grep -rn TODO src/` sweep
matches the same backlog.

| File:line | Comment | Tracked as |
|---|---|---|
| `src/lib/event-types.ts:13` | TODO note on the v1 backfill (singleton EventType per existing User) | Implicitly closed — backfill shipped in `5b8914e` |
| `src/lib/rate-limit.ts:84` | `TODO(prod): when UPSTASH_REDIS_REST_URL is set, return the Redis` | A3 (per-key rate limiting) covers the same code path |

---

## 6. Reference Index — verbatim per commit

Every implementation commit's `WHAT'S DEFERRED` block, with each line
cross-checked against HEAD and marked **shipped** or **OPEN**.

### `2306114` — feat(workspaces): foundations

> WHAT'S DEFERRED (reserved for follow-up commits)
>
> - Workspace-aware refactor of bookings / webhooks / audit. Those
>   surfaces stay user-centric for now.
> - UI pages — `/workspaces`, `/workspaces/<slug>/members`, accept
>   page at `/invitations/<token>`. Procedures are tested + ready;
>   UI is mechanical.
> - Plan gating (no billing surface exists yet — see Tier C C2).
> - Data backfill of existing users.

- Workspace-aware bookings: **shipped** (`9eb0f0f`, PR #6).
- Workspace-aware webhooks + audit: **OPEN** (B1 above).
- UI pages: **shipped** (`e69f1ca`, PR #5–8).
- Plan gating: **shipped** (`1439e7f`).
- Data backfill: **shipped** (`20260427043800_workspace_aware_bookings`).

### `7df9072` — feat(api-keys): workspace-scoped API keys + bearer auth + OpenAPI 3.1

> WHAT'S DEFERRED
>
> - Workspace-aware booking / webhook / audit endpoints — the data
>   model still hangs off User, not Workspace.
> - Scalar / Stoplight UI rendering of the spec — JSON contract is
>   what matters; rendering is mechanical.
> - Per-key rate limiting — for now the existing IP-based limiter
>   covers `/api/v1` paths. Future: a per-keyId bucket on top.
> - Admin UI for token management.

- Booking endpoints: **shipped** (PR #6).
- Webhook + audit endpoints: **OPEN** (B1).
- Scalar UI: **OPEN** (A2).
- Per-key rate limiting: **OPEN** (A3).
- Admin UI for tokens: **shipped** (PR #7).

### `ef65c97` — feat(calendar): busy-time sync (Google + Outlook)

> WHAT'S DEFERRED (commits to follow when prod feedback warrants)
>
> - Push notifications + circuit breaker — the cal.com pattern is a
>   `CalendarSubscription` model with sync state.
> - Two-way write — creating Google Calendar / Outlook events.
> - Token-at-rest encryption.
> - Settings UI.
> - Mocked-adapter integration test.

- Push notifications: **OPEN** (C1).
- Two-way write: **OPEN** (B2).
- Token encryption: **shipped** (`773285f`).
- Settings UI: **shipped** (PR #5).
- Mocked-adapter test: **OPEN** (A4).

### `1dbab8b` — feat(workflows): user-configurable email + webhook rule engine

> WHAT'S DEFERRED
>
> - Settings UI for rule editing.
> - Full migration of A8 to a default workflow row at user create
>   time.
> - SMS / Slack / Discord actions.
> - Multi-step workflows (cal.com supports rule chains via
>   `WorkflowStep`).

- Settings UI: **shipped** (PR #8).
- A8 → default Workflow row: **shipped** (`238771c`).
- SMS / Slack / Discord: **OPEN** (B11).
- Multi-step: **OPEN** (B10).

### `07bd093` — feat(embed): iframe-hosted booking widget

> WHAT'S DEFERRED (cal.com's full pattern lands later if traffic
> warrants):
>
> - Prerender — invisible iframe loaded ahead of click; visible on
>   trigger.
> - Command queue — `parent.OH.send({ command, ... })` before the
>   iframe is ready.
> - Booked event handlers — the protocol declares the message shape;
>   the iframe doesn't yet emit 'booked'.

- All three: **OPEN** (C5, C6, C7).

### `6d37510` — feat(billing): Stripe schema + signed webhook + plan-feature matrix

> WHAT'S DEFERRED (Stripe account setup is the gating dep)
>
> - Live checkout / customer-portal session creation.
> - tRPC procedures for "current plan", "start checkout", "open
>   portal".
> - Plan-gating in existing procedures.
> - Customer portal URL helper.

- Plan-gating sweep: **shipped** (`1439e7f`).
- Checkout / portal procedures: **OPEN** (B3).
- Customer portal URL helper: **OPEN** (folded into B3).

### `6307d5b` — feat(round-robin): pure host-selection algorithm

> WHAT'S DEFERRED
>
> - HostPool / EventTypeHost schema.
> - Calendar conflict lookup.
> - Distribution fairness over the lookback window.

- Schema: **shipped** (`5b8914e`).
- Calendar conflict integration: **OPEN** (B12).
- Distribution fairness lookback: **OPEN** (B13).

### `8f9bde3` — feat(auth): magic-link sign-in via http-email + Resend

> WHAT'S DEFERRED (deliberately)
>
> - Full better-auth migration.
> - UI on /login.

- Better-auth migration: **OPEN** (C8 — decision-first).
- UI on /login: **shipped** (PR #4).

### `29787cc` — feat(status): public /status page

> WHAT'S DEFERRED
>
> - Historical uptime charts.
> - Per-check telemetry.
> - Public incidents feed.

- All three: **OPEN** (C2, C3, C4 — gated on metric sink).

### `2ffca4e` — fix(workspaces): personal slug overflowed 30 chars

> A TODO worth thinking about: pull `WORKSPACE_SLUG_MAX` into the
> same module that owns the schema and the helper.

- **OPEN** (A1).

### `040a33f` — feat(reschedule): visitor-driven reschedule with audit chain + email

> Visitor-facing UI (a Reschedule button on the confirmation page +
> host-page slot-picker awareness of `?reschedule=<uid>`) is deferred
> to a follow-up commit.

- **OPEN** (A9) — verified at HEAD: no Reschedule button in
  `src/app/h/[handle]/booked/[bookingUid]/booking-confirmation.tsx`,
  no slot-picker awareness of `?reschedule=<uid>`. The procedure is
  shipped + 7-test-covered; only the UI is missing.

### `5b8914e` — feat(round-robin): B2 — schema + booking-flow integration

> NOT in this commit — workspace OWNERs can populate `EventTypeHost`
> rows directly via Prisma Studio for now. The
> `/workspaces/<slug>/event-types` surface is a future commit; ships
> its own scope.

- **OPEN** (B4).

### `1439e7f` — feat(billing): A3 — plan-gating sweep

> calendar.authUrl was on the followups doc's audit list but skipped
> intentionally — calendar.connect is in the FREE matrix already, so
> gating it is a no-op until a future "calendar-sync" PRO+ feature
> is added. The doc's list-item is orphaned, not load-bearing.

- **OPEN** (A8 — resolve the orphan).

### `e583bbc` — feat(bookings): host-side detail page

> What's deferred from the research:
>
> - Sheet drawer / intercepted route. Modern Next 15 pattern is
>   `(.)bookings/[publicUid]` for drawer-from-list with a
>   deep-linkable URL.
> - Adjacent-booking prev/next nav.
> - Webhook delivery list.

- All three: **OPEN** (A5, A6, A7).

### `6bace63` — docs(c5): cache-aside deferred

> The doc captures the reason for deferral, why building anyway is
> risky (nine-mutation invalidation surface), the dub three-tier
> cache reference for when un-deferral lands, the full invalidation
> contract per mutation, and trigger conditions.

- **OPEN — by design** (C9).

### `e33aa19` — ci: extend workflow to run vitest + playwright

> Note for the future: cal.com's `check-prisma-migrations.yml` runs
> `prisma migrate diff` to catch "edited schema.prisma but forgot
> migrate dev" before merge. SQLite can't shadow-DB the same way, so
> this lands when we go to Postgres.

- **OPEN — gated on Postgres migration** (C10).

### Followups doc §B6 (`c2330a7` + later updates)

Capabilities the workspace surface implies but no commit explicitly
shipped:

- `workspaces.update` (rename) — **OPEN** (B5).
- `workspaces.delete` — **OPEN** (B5).
- `workspaces.leave` — **OPEN** (B5).
- `workspaces.transferOwnership` — **OPEN** (B5).
- Resend invitation — **OPEN** (B8).
- Edit pending invitation role — **OPEN** (B8).
- Bulk invite (`workspaces.inviteMany`) — **OPEN** (B9).
- Workspace context switcher (global) — **OPEN** (B6).
- `/workspaces/<slug>/settings` page — **OPEN** (B7).

---

## 7. What NOT to Chase

These items have explicit "don't build" reasoning attached to them. If
you're tempted, re-read the linked doc first.

- **C9 cache-aside speculatively.** `docs/C5-cache-aside-deferred.md`
  is the contract. Nine-mutation invalidation surface is a much
  bigger maintenance cost than the cache itself. Trigger conditions
  must be met before un-deferral.
- **C8 better-auth migration speculatively.** Existing-session
  migration risk is real. Don't pay for an aesthetic preference. Wait
  for 2FA / SSO requirement.
- **B11 SMS / Slack / Discord without a user.** Each provider is its
  own integration debt. Ship one when a real user asks; not before.
- **C5 / C6 / C7 embed extensions speculatively.** Cal.com's full
  embed pattern adds parent-message-queue + dispatcher + cross-route
  message bus. Inline embeds (today's surface) are 90% of the value.
- **More locales beyond en/es.** The negotiation infrastructure
  handles N locales; adding Korean or French is translation strings,
  not engineering. Wait for a real user.
- **More dashboard pages without a feature reason.** Settings is dense
  enough. New pages must defend themselves against "add a section to
  /settings instead."

---

## A Final Word

Every item in this file is **named in a commit** and **still
outstanding**. There are 25 of them. If you do every Tier A (8 items,
roughly 4 days total), Tier B-1 through B-9 (the multi-tenant +
workspace-completeness sweep, ~2 weeks), and either pick or kill the
Tier C decision-first items — Officehours becomes the kind of project
where every implementation commit's deferral has been honored, not
just remembered.

The followups doc said it best: *"Pick A1. Decide it. The rest
follows."* That A1 (billing half-revert) is now shipped. The new
A1 — `WORKSPACE_SLUG_MAX` unification — is 30 minutes. Start there;
the file does the rest of the prioritization for you.
