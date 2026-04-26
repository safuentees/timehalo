# Officehours — Depth Ideas (Post §10.1)

This is a working backlog, not a roadmap. The keystroke-level plan still
lives in [`CAL-LAB-ROADMAP.md`](./CAL-LAB-ROADMAP.md). The mental model
still lives in [`OFFICEHOURS-PROJECT-GUIDE.md`](./OFFICEHOURS-PROJECT-GUIDE.md).
Read those first.

This file exists because the original guide's §10.1 priority list is now
**fully shipped**. Idempotency, BookingAudit, rate limiting, ICS,
observability, webhooks, soft-delete, SSE live queue, attribution
cookies, feature flags — all done with tests. The booking loop is no
longer CRUD-grade. It survives a chaos monkey.

So: what's next? This doc answers that, drawing on a fresh sequential
audit of `~/Desktop/rallly`, `~/Desktop/dub`, and `~/Desktop/cal.com`.
It is opinionated and complete — every standout pattern from those
three repos that we have *not* already absorbed, ranked by leverage.

The user instruction was "no constraints on complexity." So nothing is
off the table here, including multi-week systems. But the priority is
explicit: **build inward, not outward**. Email, i18n, timezones, env
validation, and admin UX before workspaces / billing / embed. The
project's identity (small surface, deep stack) still rules.

---

## Table of Contents

1. [Status Check](#1-status-check)
2. [The Gap That Remains](#2-the-gap-that-remains)
3. [Tier A — Inward Depth (each ≤ 1 week)](#3-tier-a--inward-depth-each--1-week)
4. [Tier B — Real Systems (each ≥ 1 week)](#4-tier-b--real-systems-each--1-week)
5. [Tier C — Portfolio Stretch](#5-tier-c--portfolio-stretch)
6. [Reference Index — New Pointers](#6-reference-index--new-pointers)
7. [What NOT to Chase](#7-what-not-to-chase)
8. [The Email Question](#8-the-email-question)

---

## 1. Status Check

A fresh audit of the codebase confirms:

- **§10.1 items 1–10**: all implemented, with tests and instrumentation.
- **Schema**: `Booking.idempotencyKey` unique, `BookingAudit` append-only,
  `Feature`/`UserFeatures`, `WebhookSubscription`, `Task`, soft-delete
  columns — all present.
- **Routers**: `bookings.create` / `bookings.cancel` wrap `withSpan`,
  rate-limit middleware, write audit rows in-transaction, fan out
  webhooks via `Task` rows, emit on the in-memory bus for SSE.
- **Pages**: host dashboard, availability, bookings (upcoming/past),
  profile, public `/h/[handle]`, confirmation `/h/[handle]/booked/[uid]`
  with ICS download.
- **Auth**: next-auth v5 beta, GitHub OAuth + credentials, Prisma
  adapter, login-attempt throttling.
- **Tests**: 8 vitest files covering idempotency / cancel / audit /
  rate-limit / webhook-cron / SSE bus / attribution / feature flags.
  Plus playwright e2e for SSR hydration.
- **Observability**: `instrumentation.ts` wired, Sentry server + edge
  configs, `withSpan` helper around the two highest-risk procedures.

**Standing gaps** (treat as the next backlog):

- No email infrastructure. None.
- No i18n / locale negotiation. English only.
- Timezone handling is shallow — schedule is day-of-week with no IANA
  zone, no DST math, no per-user / per-visitor zone display.
- No account-deletion or GDPR data-export flow.
- No env-var validation. Typos in `CRON_SECRET` / `SENTRY_DSN` silently
  no-op.
- No admin UX. Webhooks, feature flags, audit replay, task queue all
  have APIs and zero UI.
- No reschedule flow.
- No public API, no OpenAPI, no API keys.
- No workspaces / co-hosts / RBAC.
- No real calendar integration (ICS export only, no two-way sync).
- No billing layer (and that's fine for now).

---

## 2. The Gap That Remains

The §10.1 work made the booking *loop* production-grade. What's missing
now is everything that wraps the loop: the user's **first 30 seconds**
(i18n, env, onboarding, settings), the user's **last 30 seconds**
(account deletion, data export, unsubscribe), and the **invisible
plumbing** that lets the app be operated by someone other than you
(admin UX, env validation, status endpoints, structured logs).

The reference repos all share a pattern: they treat the *operator
experience* as seriously as the *user experience*. dub.co has an
internal `/admin`. rallly has cron-driven cleanup with bearer auth.
cal.com has Sentry wrappers around exactly the procedures that page on
fail. None of this shows up in a screenshot. All of it is the
difference between "I shipped a feature" and "I shipped a system."

So Tier A below is the operator-experience layer plus the universal
omissions (email, i18n, timezones, env). Tier B is the bigger product
systems (workspaces, public API, calendar OAuth, reschedule). Tier C is
the cinematic portfolio work (embed, round-robin, billing, status page).

---

## 3. Tier A — Inward Depth (each ≤ 1 week)

The goal of Tier A: every interesting omission inside the existing
shape of the app. Nothing here grows the schema by more than 2 tables.
Each item is shippable on its own and pays off independently.

| # | Item | Reference | LOC | Time |
|---|------|-----------|-----|------|
| A1 | Real email layer (Resend + React Email + dev-redirect) | dub `/packages/email/src/send-via-resend.ts:74-124`, rallly `/packages/emails/src/send-email.tsx:23-99` | ~250 | 2 days |
| A2 | Env-var validation (zod schema, build-time fail-fast) | t3-env / dub `/apps/web/lib/env.ts` | ~60 | half day |
| A3 | Real timezone handling (IANA zones, DST, change detection) | rallly `/apps/web/src/utils/timezone-schema.ts`, `/timezone-change-detector.tsx`, cal `/packages/lib/timezone.ts:27-38` | ~150 | 2 days |
| A4 | Account deletion with email-typed confirmation | rallly `/apps/web/src/app/[locale]/(space)/settings/profile/delete-account-dialog.tsx:68-75` | ~80 | half day |
| A5 | i18n with `next-intl` or `i18next` + locale negotiation | rallly `/apps/web/src/i18n/i18n.ts:19-23`, cal `/packages/i18n/server.ts:12-81` | ~200 | 3 days |
| A6 | Onboarding checklist (host first-run progress ring) | dub `/apps/web/ui/layout/toolbar/onboarding/onboarding-button.tsx:70-213` | ~120 | 1 day |
| A7 | Reschedule flow (`rescheduledFromUid` linking, audit chain) | cal `/packages/features/bookings/lib/handleNewBooking/createBooking.ts:139-147` | ~180 | 2 days |
| A8 | Reminder email job (cron + Task model, 1h before slot) | cal tasker, rallly cron `/apps/web/src/app/api/house-keeping/[...method]/route.ts` | ~100 | 1 day |
| A9 | Admin UX for webhooks, feature flags, audit replay | dub admin pattern `/apps/web/lib/auth/admin.ts:18-31` | ~300 | 3 days |
| A10 | Structured JSON logger (pino) replacing `console.log` in `withSpan` | dub Axiom `/apps/web/lib/axiom/server.ts:29-39` | ~80 | half day |
| A11 | Soft-delete cleanup cron (hard-delete after 30d, audit preserved) | rallly `/apps/web/src/app/api/house-keeping/[...method]/route.ts:1-21` | ~60 | half day |
| A12 | Test factories (`createUserInDb`, `createTestBooking`) | rallly `/apps/web/tests/test-utils.ts` | ~120 | 1 day |
| A13 | Theme + system-color preference radio (light / dark / system) | rallly `/apps/web/src/app/[locale]/(space)/settings/preferences/components/theme-preference.tsx` | ~50 | 2h |
| A14 | Error pages: branded 404, 403, 500, with link scaffolding | rallly `/apps/web/src/components/error-page.tsx` | ~120 | 1 day |
| A15 | Health + readiness endpoints (`/api/health`, `/api/ready`) for uptime monitoring | (idiomatic Next pattern) | ~40 | 2h |

**Why this order:** A1 unblocks A4, A7, A8 and removes the single
biggest "but what about email" question every person asking about the
project will have. A2 prevents a class of silent prod outages. A3 is
the most interesting *learning* item in the tier — DST math, change
detection, IANA validation are real engineering, not glue.

A4–A6 are user-experience completeness. A7 is the first real Phase-3
feature (rescheduling) and the audit-chain pattern is good practice.
A8 is the natural next thing after A1 (you can't send reminders without
email). A9 is the operator-experience pivot.

A10–A15 are small polish items, each shippable in an hour to a day.
Treat them as the candy you eat between the larger items.

### Notes on individual items

**A1 — Email layer.** Use Resend. React Email for templates. Pattern
from dub:

```ts
// /packages/email/src/send-via-resend.ts
const subjectPrefix =
  process.env.VERCEL_ENV === "preview"
    ? `[${process.env.VERCEL_GIT_COMMIT_REF}] `
    : "";
const recipient =
  process.env.NODE_ENV === "production"
    ? to
    : "delivered@resend.dev";  // dev sink
```

Three templates to start: `booking-created` (visitor), `booking-confirmed`
(visitor), `booking-cancelled` (host + visitor). Wire them through a
single `sendEmail({ template, props })` function so the call site is
identical across templates. Drop emails into `Task` queue rather than
sending inline so the tasker pattern carries them.

**A3 — Timezones.** This is two distinct sub-problems:
1. Persisted user timezone on the `User` row + visitor timezone on the
   `Booking` row, both as IANA strings, validated via
   `Intl.DateTimeFormat` (rallly's pattern in `timezone-schema.ts`).
2. Schedule semantics: `AvailabilityRange` currently has no zone. Make
   it `(dayOfWeek, start, end, timezone)`. When a visitor in a
   different zone hits `/h/<handle>`, the server resolves the host's
   ranges to UTC, generates slots, then the client renders in the
   visitor's zone.

The change-detection bonus (rallly's `timezone-change-detector.tsx`):
on every page view, compare device zone to last-known zone in
localStorage; if they differ (DST or travel), prompt the user. Tiny
component, real polish, real engineering.

**A5 — i18n.** Pick `next-intl` over `i18next` for App Router compat.
Wrap `app/[locale]` directory. Locale negotiation: `Accept-Language`
header → cookie → URL prefix. cal.com's pattern is to spread English
defaults first, then locale overrides — this means missing translation
keys silently fall back instead of showing `[missing.key]`.

**A7 — Reschedule.** Cal.com's pattern is `Booking.rescheduledFromUid:
String?` (no FK, like the audit pattern). On reschedule:
1. Cancel the old booking (soft-delete, audit row `RESCHEDULED_FROM`)
2. Create the new booking with `rescheduledFromUid = old.uid` (audit
   row `RESCHEDULED_TO`)
3. Same `operationId` on both audit rows so they correlate

The visitor sees one continuous booking. The audit log shows the chain.
Webhook fires `booking.rescheduled` with both UIDs.

**A9 — Admin UX.** dub.co's admin is just "users in the workspace
named DUB_WORKSPACE_ID." Steal that exactly: an env var
`OFFICEHOURS_ADMIN_HANDLES="alex,me"`, a middleware check, three
routes:
- `/admin/feature-flags` — toggle global flags + per-user overrides
- `/admin/webhooks` — list all webhook subscriptions, last delivery,
  retry/replay buttons
- `/admin/audit/[bookingUid]` — render the audit timeline for one
  booking

Three small CRUD pages, but they teach the pattern: production apps
have an internal surface and the surface is just authenticated React,
not a separate framework.

---

## 4. Tier B — Real Systems (each ≥ 1 week)

The goal of Tier B: each item turns the project from "single-host
scheduler" into a real product surface. Each is multi-week. Pick at
most two — the project's identity (small surface) suffers if all four
land.

### B1. Workspaces + Co-hosts + RBAC

cal.com's Membership/Team/Role model + dub.co's scope-based RBAC, in
miniature. New tables: `Workspace`, `Membership` (user × workspace +
role), `Invitation`. Roles as enum: `OWNER | ADMIN | MEMBER | VIEWER`.

The pattern that makes this worth doing is dub's **scope-permission-role
matrix** (`/apps/web/lib/api/tokens/scopes.ts:1-315`,
`/apps/web/lib/api/rbac/permissions.ts:3-163`): scopes are
`bookings.read`, `bookings.write`, `webhooks.write`, etc. Roles
aggregate scopes. API tokens carry their own scope subset. A middleware
checks "does this caller have scope X for this workspace?" before every
mutation.

The plan-gating extension (`/apps/web/lib/workspace-roles.ts:13-43`):
free plan limits roles to OWNER + MEMBER; paid unlocks ADMIN + VIEWER.
Plan-gated roles are the cleanest demonstration of how billing
intersects with permissions.

LOC: ~600. Time: 2 weeks. Reference files: above + cal's
`Membership`/`Team` in `packages/prisma/schema.prisma`.

### B2. Public API + OpenAPI + API Keys

The dub pattern (`/apps/web/lib/openapi/index.ts:1-83` +
`/apps/web/app/api/tokens/route.ts:42-184`):

- `ApiKey` model: `tokenHash` (sha256 + salt), `prefix` (first 8 chars
  visible), `scopes` (csv), `lastUsedAt`, `revokedAt`.
- Token generation: `oh_${nanoid(24)}` — opaque prefixed tokens, no
  JWT, no expiry semantics inside the token.
- Verification: timing-safe via `crypto.timingSafeEqual` (rallly's
  pattern in `/apps/web/src/app/api/private/utils/api-key.ts:7-77`).
- OpenAPI spec generated from zod schemas via `zod-openapi`. Single
  `/api/openapi.json` route that the frontend renders with Scalar.

This unblocks two stories at once: external consumers can hit the
public API, and you can write integration tests against your own API
spec rather than against the tRPC layer.

LOC: ~500. Time: 2 weeks. Reference files: above.

### B3. Two-way Calendar Sync (Google + Outlook)

The big one. cal.com's pattern
(`/packages/features/calendar-subscription/lib/CalendarSubscriptionService.ts:24-98`):

- `Credential` table: stores OAuth refresh + access tokens per provider
  per user.
- `SelectedCalendar`: which calendars to read busy-times from.
- `CalendarSubscription`: push-notification webhook channel + sync
  state (`syncSubscribedAt`, `syncSubscribedErrorCount` for circuit
  breaking).
- Adapter pattern for provider differences
  (`/packages/features/bookings/lib/EventManager.ts:81-94`): one
  interface, three impls (Google, Office365, CalDAV).
- Busy-time merge: when computing slots for `/h/<handle>`, fetch all
  selected-calendar busy ranges, merge with the host's
  `AvailabilityRange`, subtract.

Don't do this until A1 (email) is in — calendar sync is meaningless
without booking emails. Don't do this without A3 (timezones) — calendar
events are timezone-scoped.

LOC: ~1500. Time: 4 weeks. The single largest item on this doc.

### B4. Workflows / Reminders Engine

cal.com's workflows are reusable automation triggers
(`/packages/features/tasker/`): "send email X minutes before booking,"
"send SMS to host on no-show," "post to Slack on cancel."

The data model:
- `Workflow`: trigger (`BEFORE_EVENT`, `EVENT_CANCELLED`, …), offset
  (mins), action (`EMAIL_HOST`, `EMAIL_VISITOR`, `WEBHOOK_FIRE`),
  template ref.
- `WorkflowsOnEventTypes` (or for us: `WorkflowsOnHosts`): join table.
- Cron processes due workflows by enqueueing `Task` rows.

This is A8 (reminder email) generalized. Once A8 is working, the leap
to "user-configurable rules" is mostly UX.

LOC: ~700. Time: 2 weeks.

---

## 5. Tier C — Portfolio Stretch

Don't start any of these until at least 5 Tier-A items and 1 Tier-B
item are done. Each is genuinely impressive on a portfolio. None is
necessary for the project's stated identity.

### C1. Embeddable Booking Widget

cal.com's embed (`/packages/embeds/LIFECYCLE.md:1-47`) is a JS SDK +
iframe with a postMessage handshake:

- Parent loads `<script src="cal-embed.js">`, which renders an iframe
  with `originator: "CAL"` marker.
- Commands queued in parent until iframe posts `__iframeReady`.
- Iframe posts back size changes, click events, booking confirmation.
- Prerendering: invisible iframe loaded ahead of click; visible on
  trigger.

For Officehours: a `<script>` tag a host can paste on their personal
site that renders the slot picker inline. Real engineering — message
protocols, CSP, cross-origin storage, prerender lifecycle. Two weeks
of focused work.

### C2. Stripe Billing + Plan Gating

Resist the urge to add this without a story. The story would be:
"Officehours has a free tier (1 host, unlimited bookings, no webhooks)
and a paid tier (webhooks, team, API keys, custom domain)." Once the
story exists:

- `Subscription` row per workspace, mirrored from Stripe.
- Webhook handler (`/apps/web/app/(ee)/api/stripe/webhook/route.ts:15-92`)
  with event-type switch, signature verification, idempotency on
  `event.id`.
- Plan→features matrix (cal's pattern), enforced at procedure boundaries.
- Customer portal link for self-service plan changes.

Two weeks. Real but not the most interesting item.

### C3. Round-Robin / Team Scheduling

Phase-3 surface feature for B1. Cal.com's
`/packages/features/host/services/EventTypeHostService.ts:32-99`:
fixed hosts (must be present) + round-robin pool (one assigned). Weight
+ priority fields control distribution.

Algorithm: maintain a per-event-type cursor; assignment moves the
cursor; weight determines how often each host is "skippable."

LOC: ~400. Time: 1 week. Real algorithmic work, easy to test.

### C4. SSO + 2FA + Magic Links

rallly uses `better-auth` (`/apps/web/src/lib/auth.ts:130-228`) for OTP
+ OIDC + magic links + account linking with anonymous→user data
migration. Replace next-auth v5 beta with better-auth and the
auth-features story rivals any SaaS in the space.

The `onLinkAccount` hook is the gem (rallly:142-144): when an anonymous
visitor who created bookings later signs up, their bookings transfer to
the new user atomically.

LOC: ~400. Time: 1 week. Migration risk on existing sessions.

### C5. Cache-aside for `/h/[handle]`

Three-tier (dub `/apps/web/lib/api/links/cache.ts:17-128`): in-memory
LRU → Upstash Redis → Vercel cache → Postgres. Repopulate on miss
inside `waitUntil`.

Don't build until you can measure a slow page. The original guide's
§9.9 was firm on this. Still firm. But when the time comes, dub's
three-tier shape is the reference.

### C6. Status Page + Health Dashboard

Public `/status` page rendering uptime, recent incidents, and
last-N-minute booking-success rate. Pulls from the same Axiom/Sentry
sinks as the app itself. The least technical item on the list — mostly
chart UI — but it's the universal "we operate this thing seriously"
signal.

---

## 6. Reference Index — New Pointers

Pointers worth keeping handy for when you build the items above. These
are *additions* to the §11 reference list in the main guide.

### rallly

- Email pattern: `/packages/emails/src/send-email.tsx:23-99` —
  multi-provider (SES + SMTP), React templates with i18n context.
- Email template registry: `/packages/emails/src/templates.ts` — typed
  discriminated union of template names with static `getSubject()`.
- Timezone validation: `/apps/web/src/utils/timezone-schema.ts` —
  `Intl.DateTimeFormat` IANA validation + manual overrides.
- Timezone change detection:
  `/apps/web/src/app/[locale]/timezone-change-detector.tsx` —
  localStorage-cached prior zone, prompt on delta.
- Test factories: `/apps/web/tests/test-utils.ts` — `createUserInDb`,
  `createSpaceInDb`, `createTestPoll`.
- Account deletion confirm:
  `/apps/web/src/app/[locale]/(space)/settings/profile/delete-account-dialog.tsx:68-75`
  — typed-email match before mutation.
- Cron auth: `/apps/web/src/app/api/house-keeping/[...method]/route.ts:1-21`
  — Hono + bearer auth, soft+hard-delete two-stage cleanup.
- Timing-safe API key:
  `/apps/web/src/app/api/private/utils/api-key.ts:7-77` —
  `crypto.timingSafeEqual` + prefix candidate filtering.
- Better-auth setup: `/apps/web/src/lib/auth.ts:130-228` — OTP, OIDC,
  account linking, session caching in Redis.
- Error page primitive: `/apps/web/src/components/error-page.tsx` —
  reusable layout for 404 / 403 / 500.
- i18n init: `/apps/web/src/i18n/i18n.ts:19-23` — dynamic-import
  locale JSON.

### dub

- API key gen + token format: `/apps/web/lib/auth/hash-token.ts` +
  `/apps/web/app/api/tokens/route.ts:42-184`.
- Scope→permission→role RBAC:
  `/apps/web/lib/api/tokens/scopes.ts:1-315` +
  `/apps/web/lib/api/rbac/permissions.ts:3-163`.
- Plan-gated roles: `/apps/web/lib/workspace-roles.ts:13-43`.
- Workspace invites with role enforcement:
  `/apps/web/app/api/workspaces/[idOrSlug]/invites/route.ts:49-172`.
- Three-tier link cache:
  `/apps/web/lib/api/links/cache.ts:17-128`.
- OpenAPI spec gen: `/apps/web/lib/openapi/index.ts:1-83` — Zod →
  OpenAPI via `zod-openapi`.
- Onboarding checklist:
  `/apps/web/ui/layout/toolbar/onboarding/onboarding-button.tsx:70-213`
  — 4–5 task progress ring with localStorage dismiss.
- Stripe webhook orchestration:
  `/apps/web/app/(ee)/api/stripe/webhook/route.ts:15-92` —
  event-type switch, signature verify, Axiom logging.
- Resend email: `/packages/email/src/send-via-resend.ts:74-124` —
  branch-prefixed dev subjects, `delivered@resend.dev` sink.
- Admin gating: `/apps/web/lib/auth/admin.ts:18-31` — workspace
  membership = admin role.
- Domain verification: `/apps/web/lib/api/domains/verify-domain.ts` —
  Vercel API for DNS + SSL.

### cal.com

- Booking conflict check:
  `/packages/features/bookings/lib/conflictChecker/checkForConflicts.ts:39-46`
  — sorted busy times + early exit.
- Reschedule transaction:
  `/packages/features/bookings/lib/handleNewBooking/createBooking.ts:139-147`
  — atomic cancel-old + create-new.
- Calendar adapter:
  `/packages/features/bookings/lib/EventManager.ts:81-94` — credential
  factory with delegation support.
- Calendar subscription lifecycle:
  `/packages/features/calendar-subscription/lib/CalendarSubscriptionService.ts:24-98`
  — push channels, error count, circuit breaker.
- Tasker queue: `/packages/features/tasker/tasker.ts:5-40` +
  `README.md` — polymorphic handler with retry policy.
- Round-robin host service:
  `/packages/features/host/services/EventTypeHostService.ts:32-99` —
  priority + weight, fixed vs pool, manual reassignment.
- i18n with fallback: `/packages/i18n/server.ts:12-81` — English
  spread first, locale overrides.
- App store codegen: `/packages/app-store/apps.schemas.generated.ts` +
  `apps.metadata.generated.ts` — single source of truth across
  server/client.
- Embed lifecycle: `/packages/embeds/LIFECYCLE.md:1-47` — postMessage
  protocol, ready handshake, prerender.
- Booking limits: `/packages/features/bookings/lib/checkBookingLimits.ts:25-108`
  — hourly/daily/weekly/monthly caps with timezone windowing.
- Repository contracts:
  `/packages/features/bookingReference/repositories/IBookingReferenceRepository.ts`
  — interface boundaries for swappable impls.

---

## 7. What NOT to Chase

The original guide's §10.2 "what's not on the list" still applies. Here
is the post-§10.1 version:

- **More Phase-3 surface features** (group slots, recurring events,
  paid bookings, waitlists). Each is days of work that mostly teaches
  date math and form validation, not production patterns. Cap at:
  reschedule (A7) and reminder emails (A8). Anything beyond that is
  breadth posing as depth.
- **Custom CSS variables for design tokens beyond what exists.** The
  brutalist palette is dialed in. Don't redesign.
- **Monorepo split** (apps/web + packages/*). cal.com and dub do this
  because they have multiple apps. Officehours has one. The split would
  add a build-config tax with zero leverage.
- **Switching to Postgres before B3.** SQLite is fine until you need
  concurrent writes at scale or features (`array_agg`, partial indexes,
  full-text search) you don't currently use. The migration is a real
  task; do it inside B3 (calendar sync) when you'd benefit anyway.
- **Edge runtime for tRPC routes.** Tempting because dub uses it
  heavily. dub uses it because they're a redirect service hot-pathed at
  the edge. Officehours' bookings handler is not on a hot path that
  benefits from edge geographic distribution. Stay on Node.
- **Replacing tRPC with hand-rolled REST + zod.** Cute thought, real
  cost. The TS ergonomics across server/client are exactly the part
  the project is built around.
- **A custom UI library / brutalist-as-its-own-package.** Premature
  abstraction. The components already in `src/components/brutalist/`
  are right-sized.
- **A blog / docs site / marketing pages.** This is a learning
  artifact, not a launch. The README is the marketing.

---

## 8. The Email Question

Email is the single biggest gap and the single best leverage point.
Without email:

- Visitors get no booking confirmation outside the app.
- Hosts get no notification when a booking arrives.
- Reminder emails (A8) are blocked.
- Reschedule (A7) is half-blind — both parties need notification.
- Workspace invites (B1) are impossible.
- Account-deletion confirmation (A4) is reduced to in-app dialog only.
- Workflows engine (B4) has nothing to fire.

So before any of A4, A7, A8, B1, B4: ship A1.

The shape worth copying — combining dub's pattern with rallly's:

```ts
// src/lib/email/send.ts
import { Resend } from "resend";
import { render } from "@react-email/render";

const resend = new Resend(env.RESEND_API_KEY);

const TEMPLATES = {
  "booking-created": BookingCreatedEmail,
  "booking-cancelled": BookingCancelledEmail,
  "booking-rescheduled": BookingRescheduledEmail,
  "booking-reminder": BookingReminderEmail,
  "account-deletion": AccountDeletionEmail,
} as const;

type TemplateName = keyof typeof TEMPLATES;
type TemplateProps<T extends TemplateName> =
  React.ComponentProps<typeof TEMPLATES[T]>;

export async function sendEmail<T extends TemplateName>({
  to,
  template,
  props,
  idempotencyKey,
}: {
  to: string;
  template: T;
  props: TemplateProps<T>;
  idempotencyKey?: string;
}) {
  const Component = TEMPLATES[template];
  const html = await render(<Component {...props} />);
  const text = await render(<Component {...props} />, { plainText: true });

  const recipient =
    process.env.NODE_ENV === "production"
      ? to
      : "delivered@resend.dev";

  return resend.emails.send({
    from: env.EMAIL_FROM,
    to: recipient,
    subject: Component.getSubject(props),
    html,
    text,
    headers: idempotencyKey
      ? { "Idempotency-Key": idempotencyKey }
      : undefined,
  });
}
```

Then the booking handler enqueues a `Task` row instead of calling this
directly — the existing tasker pattern carries email exactly the same
way it carries webhooks. One queue, two destinations.

After that lands, A4, A7, A8 are mostly UI work.

---

## A Final Word

The §10.1 list was the inflection — the moment Officehours stopped
being a CRUD demo. This list is the second inflection — the moment it
stops being a single-user toy and starts being a thing somebody else
could operate.

If you do A1 + A2 + A3 + A4 + A7 + A9 from Tier A and B2 from Tier B
— that's 6–8 weeks of focused work — Officehours becomes
defensible at the level of a junior-to-mid engineering interview. If
you do most of Tier A and *one* Tier B item, the project rivals what
most senior candidates can show.

And if you do all of Tier A and two Tier B items, the project is
genuinely indistinguishable from a small-team SaaS. That's the ceiling.
Don't aim higher than that — the marginal return on Tier C is for
side-quest fun, not for the project's identity.

Pick A1. Build it. Ship the email layer this week. The rest follows.
