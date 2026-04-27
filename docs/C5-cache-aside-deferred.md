# C5 — Cache-aside for `/h/[handle]` — DEFERRED

## What the doc said

From `OFFICEHOURS-DEPTH-IDEAS.md` §5.C5:

> Three-tier (dub `/apps/web/lib/api/links/cache.ts:17-128`):
> in-memory LRU → Upstash Redis → Vercel cache → Postgres.
> Repopulate on miss inside `waitUntil`.
>
> **Don't build until you can measure a slow page.** The original
> guide's §9.9 was firm on this. Still firm. But when the time
> comes, dub's three-tier shape is the reference.

Plus the original `OFFICEHOURS-PROJECT-GUIDE.md` §9.9:

> *defer this until you can measure a slow page*. Pre-cache
> invalidation rules are easier to write than they are to keep
> correct.

## Why this commit ships nothing

There is no measured slow page. The public host page
(`/h/[handle]`) currently:

- Runs SSR prefetch via `createPublicSSRHelper()` so the slot
  picker hydrates with data.
- Hits one DB read for `users.getByHandle` + one for
  `schedule.getUpcomingSlots` + one for the bookings overlap
  filter inside that query + (when configured) a network fetch
  per connected calendar provider in B3's
  `fetchHostBusyTimes`.

The DB reads are sub-millisecond against SQLite locally. The
calendar fetch is the only network-bound piece, and it's already
parallelized via `Promise.allSettled`. There's no production
deploy, no real-traffic measurement, no observed cold-cache
latency, no per-request CDN bypass story.

Shipping a three-tier cache (in-memory LRU → Upstash → Vercel
edge) without that measurement violates the doc's explicit rule
*and* introduces correctness risk: cache invalidation on
`schedule.save`, `bookings.create`, `bookings.cancel`,
`bookings.reschedule`, calendar credential changes, and
availability range edits is a surface area larger than the cache
itself. Getting it wrong gives stale slots to visitors, which is
the worst possible failure mode for a scheduler.

## What lands when the time comes

When real-traffic latency is measurable + a slow page is
identified, the implementation in dub's
`/apps/web/lib/api/links/cache.ts:17-128` is the verbatim
reference. Three tiers, `waitUntil`-driven repopulation, explicit
TTLs per tier (10k LRU entries / 5s in-process, 24h Upstash, 5min
Vercel).

Invalidation contract (whatever lands has to invalidate on each
of these mutations):

| Mutation | Cache to invalidate |
|----------|--------------------|
| `users.setHandle` | profile by old + new handle |
| `users.setTimezone` | slot cache for the host |
| `schedule.save` | slot cache for the host |
| `availability.*` (any future edit) | slot cache for the host |
| `bookings.create` | slot cache for the host |
| `bookings.cancel` | slot cache for the host |
| `bookings.reschedule` | slot cache for the host (twice) |
| `calendar.setSelected` | slot cache for the host |
| `calendar.disconnect` | slot cache for the host |
| `users.deleteAccount` | profile + slot cache + handle index |

That table is the *real* cost of caching here — every mutation
has to know it touches the slot cache. The cache itself is small;
the invalidation discipline is large.

## Trigger conditions for un-deferring

- A measured `/h/[handle]` p95 above 800ms in any environment
  with load.
- A traffic profile where the same handle gets >5 reads/second
  sustained (e.g. a viral handle, a marketing campaign).
- A migration to Postgres + a network round-trip becoming
  measurable (SQLite eliminates the latency dimension entirely).

Until then: this file is the entire C5 deliverable.
