---
paths:
  - "src/trpc/**/*.ts"
  - "src/lib/**/*.ts"
  - "src/app/api/**/*.ts"
  - "prisma/schema.prisma"
---

# Production Primitives

The §10.1 work (commits `60c7e25` through `f6972cd` plus follow-ups) added ten contracts the booking flow depends on. Don't accidentally regress them.

## Idempotency on `bookings.create`
- Booking has `idempotencyKey String? @unique`. Client form generates one v4 UUID at mount via `crypto.randomUUID()` in a `useState` lazy initializer.
- Handler does a `findFirst({ idempotencyKey, deleted: false })` short-circuit BEFORE the transaction (fast path) AND inside the transaction (race protection — three concurrent retries with the same key all see "no row" pre-tx, hit the inside-tx check, and the loser returns the existing booking instead of CONFLICT).
- If you change the create handler, run `pnpm test:run` to verify the four idempotency tests in `src/trpc/__tests__/bookings-create.test.ts` still pass.

## BookingAudit (§10.1 item 2)
- `BookingAudit` has NO foreign key to Booking — `bookingUid` is a plain string. Audit rows survive deletion of the booking. This is intentional; do not "fix" it by adding a relation.
- Every state-change procedure (`bookings.create`, `bookings.cancel`, future `confirm`) writes its audit row INSIDE the same `$transaction` as the booking write. Atomicity is the whole point.
- `operationId` is a `crypto.randomUUID()` minted at the top of each procedure call. Same id threads into webhook deliveries (Task.referenceUid suffix) and span attributes — log correlation across cascading writes.

## Rate limiting
- `src/lib/rate-limit.ts` has the in-memory limiter (rallly's pattern). The middleware is `createRateLimitMiddleware(name, requests, duration)` in `src/trpc/router.ts`.
- Apply to public mutations only. Don't blanket-apply to queries.
- `bookings.create` is bucketed at 10/min/IP. Match cal.com's `core` bucket if adding new public mutations.

## Webhooks (`WebhookSubscription` + `Task` + cron)
- Three pieces: subrouter (`webhooks.create/list/delete`), scheduler (`scheduleWebhookDelivery` in `src/lib/tasks.ts`), processor (`src/app/api/cron/process-tasks/route.ts`).
- HMAC SHA-256 via `crypto.subtle` in `src/lib/webhook-signature.ts` — works in any runtime; don't switch to `node:crypto`.
- Task scheduling fires OUTSIDE the booking transaction. A delivery-side failure must NOT roll back the booking. Same separation cal.com uses.
- `referenceUid` format: `${bookingPublicUid}:${event}:${subscriptionId}`. The `@@unique([referenceUid, type])` constraint is the dedup key; the helper swallows P2002 and returns false.
- Cron route requires `Authorization: Bearer ${CRON_SECRET}`. No secret configured → 401 unconditionally.

## Soft delete + the dropped @@unique
- `Booking` has `deleted Boolean @default(false)` + `deletedAt DateTime?`. Every read filters `deleted: false` (5 sites: `getUpcomingSlots`, two idempotency lookups, `getPublicConfirmation`, `listForHost`).
- `@@unique([hostId, slotStart])` was DROPPED. SQLite has no partial unique indexes; the constraint can't be "unique only when deleted=false." Slot-collision enforcement now lives inside the `bookings.create` transaction (`findFirst({hostId, slotStart, deleted: false})` then create — SQLite serializes writes, race-free).
- Cancel (`bookings.cancel`) sets `deleted=true, deletedAt=now(), idempotencyKey=null`. Nulling the key frees the unique index entry so a future booking can reuse it.

## SSE bus + live host queue
- `src/trpc/bus.ts` is in-memory `EventEmitter`. Per-process. NOT cross-instance — multi-instance serverless deploys need Redis pub/sub (interface stays the same, swap two function bodies).
- `bookings.queue` is the subscription procedure. Server-side flag check first (`isFeatureEnabled("live-queue", ctx.user.id)`), `return` if off — closes the SSE immediately.
- Client uses `splitLink` with `httpSubscriptionLink` for subscriptions. See `src/trpc/provider.tsx`.
- The live-queue UI lives in a separate `<LiveQueue />` child of `BookingsList` so flipping the flag off unmounts it cleanly (no deprecated `useSubscription({ enabled })` flag).

## Attribution cookie (`?ref=`)
- `proxy.ts` sets `oh_ref_<handle>=<source>` (HttpOnly, Path=/, 30d, Lax). Validates value against `/^[a-zA-Z0-9._-]{1,64}$/` at the edge.
- `bookings.create` reads via `ctx.cookies.get(`oh_ref_${input.handle}`)` and writes to `Booking.referrer`. Cookies are parsed once in `src/trpc/context.ts`.
- Server-only thread by design — visitor's form does NOT send `referrer` in input.

## Feature flags
- Slug-keyed `Feature` table + `UserFeatures` join. Defaults live in `FEATURE_DEFAULTS` (`src/lib/feature-flags.ts`). The DB only stores overrides.
- Adding a flag = TS change to `FEATURE_DEFAULTS`, not a migration.
- Decision matrix: no row → default; row enabled=false → off; row enabled=true with no UserFeatures → globally on; row enabled=true with UserFeatures → only assigned users.

## Observability (`withSpan`)
- `src/lib/observability.ts` `withSpan({ name, op, attributes }, callback)`. Selective wrapping ONLY around procedures that do real side effects (booking writes, future confirm/cancel). NOT a blanket middleware — that's the whole point of the cal.com pattern.
- Sentry SDK is wired (instrumentation.ts + sentry.{server,edge}.config.ts). When DSN unset: dev-console fallback / prod no-op. Tests run with no DSN.

## Tests are the contract
- `pnpm test:run` (Vitest, 45 tests) — server-side procedure contracts. Run before committing any procedure change.
- `pnpm exec playwright test` — browser hydration smoke + auth flow. Run before committing layout/sidebar/topbar changes.
- Both are CI-gated. New patterns deserve new tests.

## Don't ever revert without flagging
- Idempotency tests caught a real race condition (commit `c2fe653`). The "obvious" simplification of moving the idempotency check OUTSIDE the transaction is wrong.
- The `mounted` gate in `OhAppSidebar` was removed once with a comment claiming `usePathname` is deterministic — that comment was wrong. Hydration test on `/settings` failed. Now backed by `useMounted()` from `src/hooks/use-mounted.ts`.
