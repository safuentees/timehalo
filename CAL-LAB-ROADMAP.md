# trpc-lab → Officehours

A Cal.com-inspired learning roadmap. Pivots the existing trpc-lab notes app into a product for faculty / mentors / creators to publish **office-hour drop-ins** — public availability windows that accept timed walk-in bookings with a shared queue. Every phase is built against a specific Cal.com reference and teaches one of the seven target tRPC patterns (or a closely related production skill).

Cal.com (cal.diy fork) lives at `/Users/santiagofuentes/Desktop/cal.com`. All file paths in this document are relative to that root unless they start with `trpc-lab/`.

---

## 1. The Pivot

### What the product becomes
**Officehours** is a minimal scheduling service for people who keep recurring open-door slots: a grad student's weekly TA hours, a musician's Friday practice drop-in, a solo founder's monthly office hours. A host publishes an **Officehours** page (replacing today's blog-style `/[user]`), defines weekly **AvailabilityWindows** and one-off **DateOverrides**, and visitors land on a public page that shows a live queue: "4 people ahead of you, estimated 18-minute wait, next free 15-minute slot at 14:30." Visitors hold a slot anonymously with a cookie-backed `SlotHold`, fill in a tiny intake form, and the host gets a real-time feed of new holds via a tRPC SSE subscription. Notes/posts become the host's public bio + pinned FAQ. The existing auth already covers the hosting side.

### Why this product, not the alternatives
A straight Cal.com clone hides most of its interesting complexity behind multi-step wizards and integrations. Officehours is a deliberately narrower domain, but the narrow scope forces you to write *every* technical primitive yourself instead of importing from a library: slot generation, timezone-safe windowing, optimistic queue UX, cookie-bound anonymous mutations, SSE fan-out, `$transaction` with row locks to prevent double-booking, HMAC webhooks. Content-calendar and creator-drop ideas are too close to your open-bin / Dub work (scheduled publishing is mostly a cron + a status field). Mentor/interview booking is the right shape but inherits the 1:1-booking baggage; adding a live queue is the differentiator that forces subscriptions. A queue makes the product feel alive and gives you a reason to ship phase 11.

### Entity mapping
| trpc-lab today | Officehours | Cal.com analogue |
|---|---|---|
| `Post` | `HostProfileNote` (pinned FAQ / bio cards on the public page) | `User.bio` + a slim `EventType.description` |
| `User` | `User` (unchanged, but adds `handle`, `timeZone`, `defaultWindowId`) | `User` (schema.prisma:401) |
| — new | `AvailabilityWindow` (weekly-recurring slot rule) | `Schedule` + `Availability` (schema.prisma:945–976) |
| — new | `DateOverride` (one-off vacation / extra window) | `Availability` row with `date` set (schema.prisma:969) |
| — new | `SlotHold` (anonymous reservation, TTL'd) | `SelectedSlots` + reserveSlot flow (slots/reserveSlot.handler.ts) |
| — new | `Booking` (confirmed visit from a hold + intake) | `Booking` (schema.prisma:851) |
| — new | `Membership` (co-host teams — phase 9+) | `Membership` (schema.prisma:744) |
| — new | `WebhookSubscription` | `Webhook` (schema.prisma:1143) |

### User flow in one sentence
Host signs up, picks a handle, draws a weekly window and a few date overrides on a schedule grid; visitors open `/h/[handle]`, see a live queue with SSE updates, hold a slot (cookie-bound, 10-minute TTL), fill a 3-field intake, and the host confirms from their dashboard which fires a webhook and appends to their SSE feed.

---

## 2. New Prisma schema (complete, copy-pasteable)

The existing `Post` model is renamed to `HostProfileNote` and loses scheduling fields. SQLite is kept for phases 1–7, then migrated to Postgres in phase 8 (see the Decimal/Time fields and composite partial indexes below). Cal.com's schema is the structural reference — especially `EventType`/`Schedule`/`Availability` split (schema.prisma:156–306, 945–976), `Booking`/`Attendee` (schema.prisma:826–930), and `SelectedSlots`/reserveSlot (slots/reserveSlot.handler.ts:24–120).

```prisma
// -------- unchanged: Account, Session, VerificationToken, Authenticator --------

model User {
  id                   String          @id @default(cuid())
  // -- existing --
  name                 String?
  email                String          @unique
  emailVerified        DateTime?
  image                String?
  passwordHash         String?
  invalidLoginAttempts Int             @default(0)
  // -- new, host-facing --
  handle               String?         @unique          // used in /h/[handle]
  timeZone             String          @default("UTC")  // IANA, e.g. "America/New_York"
  bio                  String?
  defaultWindowId      String?         @unique
  defaultWindow        AvailabilityWindow? @relation("DefaultWindow", fields: [defaultWindowId], references: [id])
  // -- relations --
  accounts             Account[]
  sessions             Session[]
  notes                HostProfileNote[]
  windows              AvailabilityWindow[] @relation("UserWindows")
  overrides            DateOverride[]
  bookings             Booking[]       @relation("HostBookings")
  memberships          Membership[]
  webhooks             WebhookSubscription[]
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  @@index([handle])
}

// formerly "Post" — now a pinned FAQ / bio card on the public page
model HostProfileNote {
  id        Int      @id @default(autoincrement())
  title     String
  body      String                              // was "excerpt"
  position  Int      @default(0)                // for drag-reorder later
  tag       String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId, position])
}

// weekly-recurring availability, mirrors cal.com Schedule + Availability
model AvailabilityWindow {
  id        String   @id @default(cuid())
  name      String                              // "Weekly office hours"
  userId    String
  user      User     @relation("UserWindows", fields: [userId], references: [id], onDelete: Cascade)
  timeZone  String                              // snapshot of user.timeZone at create
  // slot shape
  slotMinutes      Int      @default(15)
  bufferMinutes    Int      @default(0)
  queueCapacity    Int      @default(3)         // how many SlotHolds allowed in parallel
  // weekly rule: JSON array of { days: int[], startMinute: int, endMinute: int }
  // ints are minutes-since-midnight in the window's timezone (superjson-friendly)
  weeklyRule       Json
  defaultForUser   User?    @relation("DefaultWindow")
  overrides        DateOverride[]
  bookings         Booking[]
  slotHolds        SlotHold[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([userId])
}

// one-off additions or blackouts (vacation, extra Tuesday)
model DateOverride {
  id         String   @id @default(cuid())
  windowId   String
  window     AvailabilityWindow @relation(fields: [windowId], references: [id], onDelete: Cascade)
  userId     String                              // denormalized for composite index
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // exactly one of these pairs is non-null (enforced in Zod superRefine)
  date       DateTime                           // @db.Date when on Postgres
  // if isBlackout=false, startMinute/endMinute must be set (extra window)
  startMinute Int?
  endMinute   Int?
  isBlackout  Boolean @default(false)
  note        String?
  createdAt   DateTime @default(now())
  // composite index: overlap queries hit (userId, date) hard
  @@index([userId, date])
  @@index([windowId, date])
  @@unique([windowId, date])                    // one override per day per window
}

// anonymous hold before the visitor commits — superjson-worthy DateTimes here
model SlotHold {
  id          String   @id @default(cuid())
  uid         String   @unique                  // cookie-bound, mirrors cal.com reserveSlot uid
  windowId    String
  window      AvailabilityWindow @relation(fields: [windowId], references: [id], onDelete: Cascade)
  startUtc    DateTime
  endUtc      DateTime
  releaseAt   DateTime                          // TTL — mirrors cal.com MINUTES_TO_BOOK
  visitorIp   String?                           // rate-limit key, not displayed
  createdAt   DateTime @default(now())
  // composite: "is this slot already held by someone else?"
  @@index([windowId, startUtc, endUtc])
  @@index([releaseAt])                          // cleanup job query
}

// confirmed visit created from a SlotHold after intake submit
model Booking {
  id             String        @id @default(cuid())
  uid            String        @unique
  hostId         String
  host           User          @relation("HostBookings", fields: [hostId], references: [id], onDelete: Cascade)
  windowId       String
  window         AvailabilityWindow @relation(fields: [windowId], references: [id], onDelete: Cascade)
  startUtc       DateTime
  endUtc         DateTime
  visitorName    String
  visitorEmail   String
  intake         Json                            // 3-field form responses
  status         BookingStatus @default(PENDING)
  // idempotency — mirrors cal.com Booking.idempotencyKey
  idempotencyKey String?       @unique
  // for phase 8 payments — Prisma Decimal forces superjson
  priceCents     Int?                            // Decimal in the Postgres migration
  createdAt      DateTime      @default(now())
  confirmedAt    DateTime?
  cancelledAt    DateTime?
  // pattern from cal.com Booking (schema.prisma:924): composite covering index
  @@index([hostId, startUtc])
  @@index([hostId, status, startUtc])
  @@index([windowId, startUtc])
}

enum BookingStatus {
  PENDING     // host hasn't confirmed yet
  CONFIRMED
  CANCELLED
  NO_SHOW
}

// co-hosting — for phase 9 middleware chain
model Membership {
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  hostId    String                              // the User who owns the Officehours page
  role      MembershipRole @default(COHOST)
  createdAt DateTime @default(now())
  @@unique([userId, hostId])
  @@index([hostId])
}

enum MembershipRole {
  OWNER
  COHOST        // can confirm bookings, can't change windows
  VIEWER        // read-only
}

// phase 10
model WebhookSubscription {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subscriberUrl String
  secret        String                                // used in HMAC sha256
  events        String                                // CSV: "booking.created,booking.confirmed"
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  // tasker queue rows will be a separate JobRun model in phase 10
  @@index([userId, active])
}
```

**Composite indexes, explained**
- `Booking @@index([hostId, startUtc])` — the dashboard query "show me my next 50 visits" hits this cold. Copies cal.com's `Booking @@index([userId, endTime])` at schema.prisma:926.
- `Booking @@index([hostId, status, startUtc])` — filtered "pending confirmations" tab. Mirrors `[userId, status, startTime]` at schema.prisma:927.
- `SlotHold @@index([windowId, startUtc, endUtc])` — the overlap check inside `holdSlot` runs "does any live hold for this window cover this range?" Copies cal.com `Booking @@index([startTime, endTime, status])` at schema.prisma:924.
- `DateOverride @@index([userId, date])` — the availability compute loop asks "any override for this user between 2024-11-01 and 2024-11-30?" Partial-date indexes would be cal.com's pattern but SQLite can't express them; migrate to Postgres in phase 8.

**superjson-forcing fields**
- `SlotHold.startUtc / endUtc / releaseAt` — passed to the client in queries, not strings. Plain JSON would drop the Date type.
- `Booking.priceCents` — in the Postgres migration this becomes `Decimal @db.Decimal(10,2)` (superjson serializes Prisma `Decimal` as a `Decimal` instance, not a float).
- `AvailabilityWindow.weeklyRule` uses `Json` and is re-parsed by Zod — but any derived dates returned from handlers (e.g., a preview of the next 14 days of generated slots) must survive superjson.

**Reference**: full structural inspiration from `packages/prisma/schema.prisma:156–306` (EventType), `945–976` (Schedule/Availability), `826–930` (Attendee/Booking), `1653–1674` (OutOfOfficeEntry — the closest analogue to DateOverride).

---

## 3. tRPC router layout (target shape)

The end-state, after all phases are built. Cal.com's `packages/trpc/server/routers/viewer/` is the organizational reference — each subrouter gets its own folder, handlers are lazy-imported, schemas live next to handlers.

```
trpc-lab/src/trpc/
├── trpc.ts                        # initTRPC + superjson transformer + createCallerFactory export
├── context.ts                     # createContextInner vs createContext (mirrors cal.com)
├── middlewares/
│   ├── perfMiddleware.ts          # matches packages/trpc/server/middlewares/perfMiddleware.ts
│   ├── errorConversionMiddleware.ts
│   ├── rateLimitMiddleware.ts     # phase 2 — cookie-bound for anons, userId for authed
│   ├── sessionMiddleware.ts       # isAuthed + isAdmin (unstable_pipe)
│   └── membershipMiddleware.ts    # phase 9 — hostId → role check
├── procedures/
│   ├── publicProcedure.ts         # procedure.use(perf).use(errorConversion)
│   ├── rateLimitedPublic.ts       # publicProcedure.use(rateLimit({ limit: 20/min }))
│   ├── authedProcedure.ts         # publicProcedure.use(isAuthed)
│   ├── hostProcedure.ts           # authedProcedure.use(withOwnedHost) — injects hostId
│   └── withMembershipProcedure.ts # hostProcedure.use(withMembership(role))
├── routers/
│   ├── _app.ts                    # mergeRouters or nested root
│   ├── notes/                     # the renamed posts router
│   │   ├── _router.ts
│   │   ├── list.handler.ts + .schema.ts
│   │   ├── create.handler.ts + .schema.ts
│   │   ├── reorder.handler.ts + .schema.ts   # phase 3 — optimistic drag-reorder
│   │   └── delete.handler.ts + .schema.ts
│   ├── windows/
│   │   ├── _router.ts
│   │   ├── create.handler.ts + .schema.ts    # phase 4 — superRefine for rule validation
│   │   ├── update.handler.ts + .schema.ts    # mirrors cal.com update.handler.ts
│   │   ├── list.handler.ts + .schema.ts
│   │   └── get.handler.ts + .schema.ts
│   ├── overrides/
│   │   ├── _router.ts
│   │   └── upsert.handler.ts + .schema.ts    # superRefine: blackout XOR hours
│   ├── slots/
│   │   ├── _router.ts
│   │   ├── compute.handler.ts + .schema.ts   # phase 5 — public, the hot path
│   │   ├── hold.handler.ts + .schema.ts      # phase 6 — cookie uid, TTL, $transaction
│   │   └── release.handler.ts + .schema.ts
│   ├── bookings/
│   │   ├── _router.ts
│   │   ├── commit.handler.ts + .schema.ts    # phase 7 — hold → booking, $transaction
│   │   ├── list.handler.ts + .schema.ts
│   │   ├── confirm.handler.ts + .schema.ts   # phase 8 — optimistic status flip
│   │   ├── cancel.handler.ts + .schema.ts
│   │   └── queue.handler.ts + .schema.ts     # phase 11 — subscription
│   ├── memberships/                          # phase 9
│   │   ├── _router.ts
│   │   ├── invite.handler.ts + .schema.ts
│   │   └── list.handler.ts + .schema.ts
│   ├── webhooks/                             # phase 10
│   │   ├── _router.ts
│   │   ├── create.handler.ts + .schema.ts
│   │   └── test.handler.ts + .schema.ts
│   └── public/
│       ├── _router.ts                        # no auth, no batching in phase 6+
│       └── getHost.handler.ts + .schema.ts
└── server-helpers.ts               # createRouterCaller — phase 2 rewrites this
```

**Procedure matrix** (reading: `input → middleware stack`)

| Procedure | Input | Middleware stack | Used by |
|---|---|---|---|
| `publicProcedure` | — | `perf → errorConversion` | `notes.list`, `public.getHost` |
| `rateLimitedPublic` | — | `perf → errorConversion → rateLimit(20/min by cookie-uid or IP)` | `slots.compute`, `slots.hold`, `bookings.commit` |
| `authedProcedure` | — | `rateLimitedPublic → isAuthed` | `notes.create`, `windows.update`, `bookings.list` |
| `hostProcedure` | `{ hostId }` OR derives from ctx.user | `authedProcedure → withOwnedHost` | `windows.update`, `overrides.upsert` |
| `withMembershipProcedure(role)` | `{ hostId }` | `hostProcedure → withMembership(role)` | `bookings.confirm` (COHOST ok), `windows.update` (OWNER only) |

**Procedure signatures** (every new procedure the roadmap introduces)

```ts
// notes/*  (phase 1 renames)
notes.list              = publicProcedure.query()
notes.create            = authedProcedure.input(ZCreateNote).mutation()
notes.reorder           = authedProcedure.input(ZReorder).mutation()        // phase 3 optimistic
notes.delete            = authedProcedure.input(ZId).mutation()

// windows/*  (phase 4)
windows.list            = authedProcedure.query()
windows.get             = authedProcedure.input(ZId).query()
windows.create          = hostProcedure.input(ZCreateWindow).mutation()
windows.update          = withMembershipProcedure("OWNER").input(ZUpdateWindow).mutation()

// overrides/*  (phase 4)
overrides.upsert        = hostProcedure.input(ZUpsertOverride).mutation()
overrides.listForMonth  = authedProcedure.input(ZMonth).query()

// slots/*  (phase 5–6)
slots.compute           = rateLimitedPublic.input(ZComputeSlots).query()    // public, no auth
slots.hold              = rateLimitedPublic.input(ZHoldSlot).mutation()     // cookie uid
slots.release           = rateLimitedPublic.input(ZReleaseSlot).mutation()

// bookings/*  (phase 7–8, 11)
bookings.commit         = rateLimitedPublic.input(ZCommitBooking).mutation()// idempotencyKey
bookings.list           = authedProcedure.input(ZListBookings).query()
bookings.confirm        = withMembershipProcedure("COHOST").input(ZId).mutation()
bookings.cancel         = withMembershipProcedure("COHOST").input(ZId).mutation()
bookings.queue          = authedProcedure.input(ZHostId).subscription()     // SSE

// memberships/*  (phase 9)
memberships.list        = hostProcedure.query()
memberships.invite      = withMembershipProcedure("OWNER").input(ZInvite).mutation()
memberships.remove      = withMembershipProcedure("OWNER").input(ZId).mutation()

// webhooks/*  (phase 10)
webhooks.list           = authedProcedure.query()
webhooks.create         = authedProcedure.input(ZCreateWebhook).mutation()
webhooks.test           = authedProcedure.input(ZId).mutation()

// public/*  (phase 5)
public.getHost          = publicProcedure.input(ZHandle).query()
```

**References**
- Router layout: `packages/trpc/server/routers/viewer/bookings/_router.tsx` — especially the dynamic `await import("./commit.handler")` pattern at lines 23–30, which keeps cold-start small.
- Middleware chains: `packages/trpc/server/procedures/authedProcedure.ts:27` for `procedure.use(perf).use(errorConversion).use(isAuthed)`, and `packages/trpc/server/middlewares/sessionMiddleware.ts:26` for `isAuthed.unstable_pipe(isAdminMiddleware)`.
- PBAC procedures: `packages/trpc/server/procedures/pbacProcedures.ts:22–50` — `createTeamPbacProcedure` is the template for `withMembershipProcedure`.

---

## 4. Feature phases — ORDER MATTERS

Each phase depends on the previous. Git-commit boundaries are suggested in the "Success criteria" block.

---

### Phase 1: Rename `Post → HostProfileNote`, split router into files, add superjson

**Goal** — Move from the current one-file `src/trpc/router.ts` to Cal.com's per-procedure layout, and flip the transformer to superjson end-to-end.

**What you build**
- Prisma migration: `Post` → `HostProfileNote`, add `title/body/position/tag`, drop `date/readTime/excerpt`.
- Split `src/trpc/router.ts` into `src/trpc/routers/notes/{list,create,delete}.{handler,schema}.ts` plus `_router.ts`.
- Add superjson transformer to both server (`initTRPC.create({ transformer: superjson })`) and client (both `trpc.createClient({ transformer })` and the SSR helper).
- Return `createdAt: Date` from `notes.list` and verify the client receives a real `Date` object (phase proof).
- Wire a temporary `e2eDate.query()` procedure that returns `{ now: new Date(), big: 9007199254740993n }` and `console.log` the client result — you should see `Date` and `BigInt`, not strings.

**tRPC pattern learned** — (6) Input/output transformers: superjson for Date/BigInt/Decimal. Plus the file-splitting convention that makes phase 9 feasible without drowning.

**Cal.com reference**
- Transformer wiring: `packages/trpc/server/trpc.ts:8–11` (server) and `packages/trpc/react/trpc.ts:127` (client).
- File split: `packages/trpc/server/routers/viewer/availability/schedule/_router.tsx:1–109` (schema separated from handler) and `create.handler.ts:19–77` (handler signature shape).

**Prisma work**
```sql
-- Post table renamed, fields rewritten
ALTER TABLE Post RENAME TO HostProfileNote;
-- + Prisma migrate with the new field names; use a backfill SQL step for title=title, body=excerpt
```

**Hard subtask** — Make the SSR helper (`src/trpc/server-helpers.ts`) use the same superjson transformer as the client. `createServerSideHelpers` requires it passed in a different field; if you forget, hydration will mismatch (client thinks the cached value is a string, server sent a Date). The mismatch warning is the test.

**Success criteria**
- `notes.list` returns rows where `typeof row.createdAt.getMonth === "function"` on the client.
- The `e2eDate` procedure shows `BigInt` on the client (then delete the procedure).
- `git log` shows one commit per split handler file, not a mega-commit.

**Est. time** — 2 days.

---

### Phase 2: Middleware chain + rewrite `createRouterCaller` + server-side calling

**Goal** — Mirror Cal.com's `perf → errorConversion → isAuthed → (optional pipe)` chain, and replace the current `createServerSideHelpers` with `createCallerFactory` so Server Components call the router with **no HTTP hop**.

**What you build**
- New `src/trpc/middlewares/{perfMiddleware,errorConversionMiddleware,sessionMiddleware}.ts` that mirror cal.com's three files.
- `src/trpc/procedures/{publicProcedure,authedProcedure}.ts` — compose the middleware stack.
- Rewrite `src/trpc/server-helpers.ts` to export `createRouterCaller(router, ctx?)` that returns a caller via `createCallerFactory<TRouter>(router)(ctx)`. Delete the old `createServerSideHelpers` imports.
- Convert `src/app/(dashboard)/page.tsx` (or whatever the home dashboard is) to a Server Component that calls `await createRouterCaller(notesRouter).list()` and renders directly. No `"use client"`. No `trpc.notes.list.useQuery()`. No suspense.
- Keep one client-component page (the `/new` post form) still on `useMutation` for comparison.

**tRPC pattern learned** — (1) Server-side calling via `createCaller`, plus middleware composition with `unstable_pipe`.

**Cal.com reference**
- `createCallerFactory` wiring: `packages/trpc/server/trpc.ts:17` + usage in `apps/web/app/_trpc/context.ts:18–22` (`createRouterCaller(router, ctx)`).
- Real usage in RSC: `apps/web/app/(use-page-wrapper)/availability/[schedule]/page.tsx:38–46` — `Promise.all([createRouterCaller(availabilityRouter), createRouterCaller(travelSchedulesRouter)])`.
- Middleware composition: `packages/trpc/server/procedures/authedProcedure.ts:27` and `sessionMiddleware.ts:26` for `isAuthed.unstable_pipe(isAdminMiddleware)`.

**Prisma work** — none.

**Hard subtask** — The `createRouterCaller` must accept *either* an override context or build one from cookies/headers, same as `apps/web/app/_trpc/context.ts:13–16`. You must not call `auth()` twice if the page already has the session. Write it so that if `ctx` is passed, `auth()` is **not** called again. Prove it by adding a `console.log` in `createContext` and confirming the RSC hits it exactly once per request.

**Success criteria**
- Dashboard page source shows `await createRouterCaller(notesRouter).list()` and no `trpc.useQuery`.
- Chrome devtools network tab on initial page load shows **zero** `/api/trpc/notes.list` requests.
- Hitting a protected handler from a non-authed caller throws `UNAUTHORIZED` with the exact error shape from `errorConversionMiddleware`.

**Est. time** — 3 days.

---

### Phase 3: Note drag-reorder with optimistic `onMutate` + `setQueryData` + rollback

**Goal** — Implement the canonical optimistic-update pattern (the one the user has not done) on the notes list: drag to reorder, UI updates immediately, mutation runs, rollback on failure.

**What you build**
- `notes.reorder` procedure: `{ orderedIds: string[] }` → prisma `$transaction` that rewrites `position` for the whole list. Use `$transaction` because a partial write would corrupt order.
- A `NoteList` client component with a lightweight drag (`@dnd-kit/core`) or even arrow-button reorder. No need for a fancy library.
- Wire the mutation with:
  ```ts
  const utils = trpc.useUtils();
  const reorder = trpc.notes.reorder.useMutation({
    onMutate: async ({ orderedIds }) => {
      await utils.notes.list.cancel();
      const previous = utils.notes.list.getData();
      utils.notes.list.setData(undefined, (old) =>
        orderedIds.map((id) => old!.find((n) => n.id === id)!)
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
    },
    onSettled: () => utils.notes.list.invalidate(),
  });
  ```
- A deliberate "break the mutation" toggle: a button that sets a query param `?fail=1` which the handler reads and throws — so you can see the rollback actually run.

**tRPC pattern learned** — (3) Optimistic updates via `onMutate` + `setQueryData` + rollback. Critically: `cancel()` to stop in-flight refetches, `getData()` snapshot, `setData()` optimistic write, rollback in `onError` using the context returned from `onMutate`. Not just "invalidate."

**Cal.com reference** — Cal.com's booking flow predates React Query's formal optimistic pattern and uses mostly `invalidate()`; the one place to look is `packages/platform/atoms/hooks/stripe/useCheck.ts` for the `setQueryData` habit. This phase deliberately goes further than cal.com's current code — the tRPC v11 docs for `useUtils().xxx.setData()` are the better reference (see https://trpc.io/docs/client/react/useUtils). You should *read the source of `useUtils`* in `@trpc/react-query/src/internals/trpcResult.ts` — it's short and illuminating.

**Prisma work** — add `position Int @default(0)` to `HostProfileNote` and a composite `@@index([userId, position])`. Backfill with a `prisma.$transaction` inside the migration script.

**Hard subtask** — Make reorder idempotent. If the user drags, the mutation is in flight, and they drag again, the second `onMutate` must snapshot the *current optimistic state* (not the server state). Test by setting a 2-second artificial delay in the handler and dragging twice quickly. If your cancel/getData flow is right, the UI stays consistent; if wrong, it snaps back to an intermediate state.

**Success criteria**
- Reorder a note → list updates in <16ms (before the network round trip).
- Toggle the failure switch → list snaps back to the previous order after the error toast.
- Drag twice with a 2-second handler delay → final order matches both drags, no flicker.

**Est. time** — 3 days.

---

### Phase 4: Availability windows + date overrides with `useFieldArray` + superRefine

**Goal** — Build the weekly schedule grid (the Cal.com Availability page, simplified) on top of a Zod schema that validates the weekly rule with `superRefine`, and wire it with nested `useFieldArray`.

**What you build**
- The `AvailabilityWindow` and `DateOverride` models (prisma migrate).
- `windows.create` / `windows.update` with a `ZWeeklyRuleSchema` that uses `superRefine` to enforce:
  1. For each day's range array, `endMinute > startMinute`.
  2. No two ranges on the same day overlap.
  3. `slotMinutes` divides evenly into every range length.
  4. `queueCapacity ≥ 1`.
- `overrides.upsert` with `superRefine` enforcing blackout XOR hours: exactly one of `isBlackout=true` OR (`startMinute != null && endMinute != null`).
- A `ScheduleEditor` client component with `useFieldArray` at two levels: outer array = days of week, inner array per day = time ranges. Mirror the shape cal.com uses in `ScheduleComponent.tsx:183–`.
- A "copy to other days" button that clones one day's ranges into multiple selected days — mirrors cal.com's `CopyButton` at `ScheduleComponent.tsx:139–181`.

**tRPC pattern learned** — Zod `superRefine` for cross-field validation; `useFieldArray` nesting; the tRPC handler pattern where *the schema doing the real work is exported from a service* (mirroring cal.com's `ScheduleService.ts:11–36` `ZUpdateInputSchema`).

**Cal.com reference**
- Weekly rule + dateOverride Zod: `packages/features/schedules/services/ScheduleService.ts:11–36`. Copy the shape.
- Nested `useFieldArray`: `packages/features/schedules/components/ScheduleComponent.tsx:12` imports + usage pattern in the same file.
- superRefine elsewhere in cal.com: `packages/trpc/server/routers/viewer/oAuth/updateClient.schema.ts:20–28` — "if status=REJECTED, rejectionReason is required" — a small but clear example of the pattern.
- Handler structure: `packages/trpc/server/routers/viewer/availability/schedule/update.handler.ts:15–22` delegates to a service, keeping the router thin.

**Prisma work** — the two new models from the schema in section 2. Add `AvailabilityWindow.weeklyRule Json` and keep SQLite for now (JSON as text is fine at this size).

**Hard subtask** — Generating time ranges as minute-integers (not Date objects) is the hardest part. Dates in a form are fragile across DST; minute-integers are immune. But the UI needs a time picker that reads `14:30` and writes `870`. Write a `minutesToHHMM` / `hhmmToMinutes` pair and *unit-test them with Vitest* covering DST crossover days in `America/New_York`. The rule is: never store wall-clock times as Dates.

**Success criteria**
- Can draw a weekly schedule with 5 days, 2 ranges per day.
- Server rejects an overlapping range with a Zod error pinpointing the specific day and range index.
- Adding a date override with both blackout=true AND hours returns a `superRefine`-originated error message.
- Change `slotMinutes` to 17 on a 60-minute range → error ("slotMinutes must divide range length").

**Est. time** — 1 week. This phase is dense.

---

### Phase 5: Public slot computation with SSR prefetch + HydrationBoundary

**Goal** — The public page `/h/[handle]` shows tomorrow's available slots with **zero spinner on first paint**. This is the classic SSR prefetch pattern.

**What you build**
- `public.getHost({ handle })` — public query, returns `{ user, window, notes }`.
- `slots.compute({ windowId, startUtc, endUtc, timeZone })` — public query. Pure function over weekly rule, date overrides, and existing non-cancelled bookings. Returns `{ slots: [{ startUtc, endUtc, available: boolean }] }`.
- A `/h/[handle]` Server Component that:
  1. Calls `createRouterCaller(publicRouter).getHost({ handle })` to check the host exists (no http).
  2. Creates a `QueryClient`, calls `queryClient.prefetchQuery({ queryKey, queryFn: () => caller.slots.compute(...) })`.
  3. Wraps the client-only `SlotGrid` in `<HydrationBoundary state={dehydrate(queryClient)}>`.
- The client `SlotGrid` calls `trpc.slots.compute.useQuery(args)` with the same args — it returns synchronously from cache, no spinner.

**tRPC pattern learned** — (2) SSR prefetch + HydrationBoundary. Understanding *why* the query key must match exactly between server-prefetch and client-`useQuery` (one typo = cache miss = spinner).

**Cal.com reference**
- Cal.com doesn't formally use `HydrationBoundary` in the trpc client path (they pass `data` as props). The tRPC v11 docs pattern is what applies here — see https://trpc.io/docs/client/react/server-components. But the analogous cal.com pattern is `apps/web/app/(use-page-wrapper)/(main-nav)/event-types/page.tsx:34–43`: wrap the caller in `unstable_cache`, return server props, pass to `<EventTypesWrapper />`. Study this file line-by-line — it's exactly the non-HydrationBoundary version of the same idea. You'll implement **both**: the `unstable_cache` path for `getHost` (data rarely changes) and the HydrationBoundary path for `slots.compute` (data changes as visitors hold slots).

**Prisma work** — none; slot computation is pure over existing rows.

**Hard subtask** — The slot computation must be correct across timezones. The window's timezone is the host's; the visitor's browser is in a different zone. Generate slots in the host's zone, convert to UTC at the boundary, send UTC to the client, let the client render in the visitor's zone. Write a test that: host in `America/New_York`, visitor in `Asia/Tokyo`, window is Monday 9am–5pm. Verify that a slot starts at `2024-11-04 09:00 EDT` and renders as `2024-11-04 22:00 JST`. Use the Temporal polyfill or `@date-fns/tz` — **not** raw Date math.

**Success criteria**
- View-source on `/h/[handle]` shows the slot HTML already rendered. No "Loading slots..." text.
- Chrome devtools throttled to Slow 3G → the page shows slots before `useQuery` hits the network (network tab shows the trpc request starting only after hydration, not before).
- Change your system clock to a timezone ±12 hours away → slots still line up with the host's intended hours.

**Est. time** — 1 week.

---

### Phase 6: Anonymous slot holds with cookie `uid`, rate limit middleware, link composition

**Goal** — Replace the single `httpBatchLink` with `loggerLink` + `splitLink` + (`httpBatchLink` | `httpLink`) so that public `slots.*` calls skip batching (they need fresh cookie headers), and add rate limiting keyed on cookie `uid` or IP.

**What you build**
- `src/trpc/middlewares/rateLimitMiddleware.ts` — an in-memory LRU (e.g., `lru-cache`) keyed on `ctx.user?.id ?? ctx.req.cookies.uid ?? ctx.req.headers["x-forwarded-for"]`. 20 ops/min for anonymous, 100/min for authed.
- `src/trpc/procedures/rateLimitedPublic.ts` — `publicProcedure.use(rateLimitMiddleware({ limit: 20, intervalMs: 60_000 }))`.
- `slots.hold({ windowId, startUtc, endUtc })` — sets a `uid` cookie (if missing), inserts a `SlotHold` row with `releaseAt = now() + 10min`. Uses `$transaction` + a row lock to prevent two visitors holding the same slot.
- `slots.release({ uid })` — deletes holds matching that `uid`.
- Rewrite `src/trpc/provider.tsx` to use:
  ```ts
  links: [
    loggerLink({ enabled: (op) => process.env.NODE_ENV === "development" || op.direction === "down" && op.result instanceof Error }),
    splitLink({
      condition: (op) => op.context.skipBatch === true,
      true: httpLink({ url: "/api/trpc", transformer: superjson }),
      false: httpBatchLink({ url: "/api/trpc", transformer: superjson }),
    }),
  ]
  ```
- Pass `{ context: { skipBatch: true } }` to every `slots.*` mutation option.

**tRPC pattern learned** — (5) Link composition: `httpBatchLink` + `splitLink` + conditional `loggerLink`. Plus custom rate-limit middleware.

**Cal.com reference**
- `packages/trpc/react/trpc.ts:70–96` — the exact splitLink pattern with `op.context.skipBatch`.
- `apps/web/app/_trpc/trpc-client.ts:42–80` — the App Router version of the same composition.
- Rate limit middleware stub: `packages/trpc/server/procedures/authedProcedure.ts:7–29` — commented-out cal.com version you're reimplementing for real.
- `$transaction` with row lock: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:41–81` — the `FOR UPDATE` raw query pattern is *exactly* what you need for the slot hold.

**Prisma work** — `SlotHold` model from section 2. On SQLite, raw `FOR UPDATE` doesn't exist; use `BEGIN IMMEDIATE` + re-check inside the transaction. Plan to migrate to Postgres in phase 8 to get real row locks.

**Hard subtask** — The `$transaction` must reject the second concurrent hold for the same slot. Write a test (Vitest + `Promise.all`) that fires two `slots.hold` calls for the same `(windowId, startUtc, endUtc)` simultaneously. Exactly one must succeed; the other must throw `CONFLICT`. If both succeed you've got the race wrong.

**Success criteria**
- Dev console shows `loggerLink` pretty-prints queries in development, stays silent in production.
- Devtools network tab: `notes.list` + `notes.create` in a single request (`batch`), but `slots.hold` alone.
- Running the concurrent-hold test 100 times: exactly 100 successes + 100 conflicts, zero duplicate holds in the DB.

**Est. time** — 5 days.

---

### Phase 7: Hold → Booking commit with intake form + idempotency

**Goal** — Turn a `SlotHold` into a `Booking` atomically: validate intake, write `Booking`, delete the hold, enforce idempotency. This is where the user finally learns `Prisma.$transaction` with multiple writes.

**What you build**
- Intake form on the public page (3 fields: name, email, question) with RHF + a `ZIntakeSchema` Zod shape.
- `bookings.commit({ holdUid, intake, idempotencyKey })` — the idempotencyKey is a UUID generated client-side at the moment the user *opens* the intake form (not when they submit). This means double-clicks on "Book" reuse the same key.
- Inside `commit`:
  ```ts
  return prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({ where: { idempotencyKey } });
    if (existing) return existing; // idempotency short-circuit

    const hold = await tx.slotHold.findUnique({ where: { uid: holdUid } });
    if (!hold || hold.releaseAt < new Date()) throw new TRPCError({ code: "GONE" });

    const booking = await tx.booking.create({ data: { ... } });
    await tx.slotHold.delete({ where: { uid: holdUid } });
    return booking;
  });
  ```
- Wire the form `onSubmit` to the mutation; on success redirect to `/h/[handle]/booked/[uid]` (a thank-you page — also SSR-prefetched).
- On the host dashboard, add a pending-confirmations count badge driven by `bookings.list({ status: "PENDING" })`.

**tRPC pattern learned** — Prisma `$transaction` with three writes and an idempotency guard. The **unit of atomicity** concept: what happens if the server crashes between create and delete? With a transaction, nothing. Without, a phantom hold survives.

**Cal.com reference**
- Idempotency key field: `packages/prisma/schema.prisma:855` — `Booking.idempotencyKey String? @unique`.
- `$transaction` pattern: `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts:44–110` — specifically how the `tx.$queryRaw FOR UPDATE` + fresh read + write sequence is ordered.
- `requestReschedule.handler.ts` in `packages/trpc/server/routers/viewer/bookings/` — same "read old, create new, delete old in one transaction" template.

**Prisma work** — `Booking` model from section 2, with the `idempotencyKey` unique constraint.

**Hard subtask** — Make the idempotency truly correct. The client generates the key once and reuses it across retries. Prove it by adding an artificial 3-second delay in the handler and double-clicking the submit button. Exactly one booking row appears. Then simulate a network failure mid-transaction (throw inside the transaction after the create but before the delete) — verify no booking and no missing hold in the DB.

**Success criteria**
- Double-click submit → one booking, not two.
- Tab back to the thank-you page → shows the same `Booking`.
- Delete the `SlotHold` row by hand and re-submit with the same key → returns the existing booking (not a 404).
- Kill the server mid-transaction (console.error + throw after the booking create) → DB state is unchanged (no orphan booking, hold still present, hold still TTL'd).

**Est. time** — 5 days.

---

### Phase 8: Postgres migration + optimistic host-side confirm/cancel + Decimal pricing

**Goal** — Move from SQLite to Postgres (for real row locks, partial indexes, `Decimal`), add a `priceCents: Decimal` field to `Booking`, and implement the host dashboard's "confirm" button with proper optimistic updates (the list reshuffles instantly, pending-count badge decrements, rollback on error).

**What you build**
- Docker Compose file with Postgres 16, update `DATABASE_URL`, regenerate Prisma client.
- Add `Booking.priceCents Decimal @db.Decimal(10, 2) @default(0)` (optional pricing for paid office hours). Keep it `0` by default — phase 12 adds Stripe if you get there.
- Convert `DateOverride.date` to `@db.Date`, verify the composite index works on Postgres.
- `bookings.confirm({ id })` and `bookings.cancel({ id })` — `withMembershipProcedure("COHOST")` procedures that flip `status` and stamp `confirmedAt` / `cancelledAt`.
- On the dashboard:
  ```ts
  const confirm = trpc.bookings.confirm.useMutation({
    onMutate: async ({ id }) => {
      await utils.bookings.list.cancel();
      const previous = utils.bookings.list.getData({ status: "PENDING" });
      utils.bookings.list.setData(
        { status: "PENDING" },
        (old) => old!.filter((b) => b.id !== id)
      );
      utils.bookings.list.setData(
        { status: "CONFIRMED" },
        (old) => [...(old ?? []), previous!.find((b) => b.id === id)!]
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) utils.bookings.list.setData({ status: "PENDING" }, ctx.previous);
    },
    onSettled: () => {
      utils.bookings.list.invalidate();
    },
  });
  ```

**tRPC pattern learned** — Advanced `setQueryData` across **two** different query keys at once (moving an item between lists). This is the part of the optimistic pattern the user actually hasn't done — not just a single-list update.

**Cal.com reference**
- Decimal handling with superjson: confirm by looking at a Stripe credit handler, e.g. `packages/features/bookings/lib/handlePayment.ts`. Superjson serializes `Decimal` as a tagged object.
- Confirm handler template: `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts`.
- Multi-key `setQueryData`: cal.com doesn't do this pattern cleanly, so use the tRPC v11 React Query docs for `useUtils().xxx.setData()` and understand that `setData(filters, updater)` lets you target a specific query-key slice.

**Prisma work** — full migration from SQLite to Postgres. Write a one-time data-copy script.

**Hard subtask** — Prove that the `Decimal` survives the tRPC round-trip as a `Decimal` instance (not a string or number). Add a temporary handler that returns `{ price: new Prisma.Decimal("19.95") }` and on the client `console.log(result.price.toFixed(2))`. If superjson isn't wired right, `.toFixed` won't exist.

**Success criteria**
- `docker compose up` → Postgres running, migrations applied, all existing phase-1–7 tests pass.
- Confirm a booking → it vanishes from the "Pending" tab and appears in "Confirmed" **before** the network request resolves (devtools shows a ~50ms gap).
- Simulate a handler 500 → booking snaps back to Pending.
- `typeof booking.priceCents.toFixed` === `"function"` on the client.

**Est. time** — 1 week.

---

### Phase 9: Co-host memberships + full middleware chain `public → rateLimited → authed → withHost → withMembership`

**Goal** — Add a `Membership` table so a host can invite co-hosts who can confirm bookings but not edit windows. Build the terminal middleware chain, with each middleware adding to the context.

**What you build**
- `Membership` model + migration.
- `withOwnedHost` middleware: reads `input.hostId`, verifies `ctx.user.id` is either the host's owner or has a membership, injects `ctx.hostId` and `ctx.membershipRole`.
- `withMembership(requiredRole)` factory mirroring `createTeamPbacProcedure`: checks `ctx.membershipRole` covers the required role (OWNER > COHOST > VIEWER).
- `memberships.invite` procedure that creates a pending membership and sends an email (console.log is fine in dev).
- A "Cohosts" tab on the host dashboard.
- Update `bookings.confirm` to use `withMembershipProcedure("COHOST")` and `windows.update` to use `withMembershipProcedure("OWNER")`. Verify in dev that a COHOST user cannot update windows but can confirm.

**tRPC pattern learned** — (4) Middleware chains. Each middleware layer *adds* to `ctx` and the next one reads what the previous added. `unstable_pipe` vs `.use()` and why the chain must be linear (`pipe` preserves types, `.use` chains them at runtime).

**Cal.com reference**
- `packages/trpc/server/procedures/pbacProcedures.ts:22–97` — the whole file is a template for `withMembership`. Specifically `createTeamPbacProcedure` at line 22 adds a `teamId` input and checks a permission against the service; your `withMembership` does the same for `hostId`.
- `packages/trpc/server/middlewares/sessionMiddleware.ts:26` — `isAuthed.unstable_pipe(isAdminMiddleware)` — use `unstable_pipe` for composing middleware factories that return typed contexts.

**Prisma work** — `Membership` model with `@@unique([userId, hostId])` and composite `@@index([hostId])`.

**Hard subtask** — Make the middleware chain type-level correct. When `windows.update` declares `withMembershipProcedure("OWNER").input(ZUpdate).mutation(({ ctx }) => { ... })`, inside the mutation body, `ctx` should have `ctx.user` **and** `ctx.hostId` **and** `ctx.membershipRole` all typed — without any `as any` casts or optional-chain fallbacks. If you see `ctx.hostId?.` you did it wrong. The type chain is: middleware returns `next({ ctx: { ...ctx, hostId } })`, and the next middleware reads that `hostId` with full typing.

**Success criteria**
- A COHOST calling `windows.update` gets a `FORBIDDEN` tRPC error with a message "Role OWNER required, you have COHOST".
- Inside a `bookings.confirm` handler, `ctx.hostId` is typed as `string` (not `string | undefined`).
- Zero `any` in the middleware file.

**Est. time** — 4 days.

---

### Phase 10: Webhooks with HMAC signing + tasker-style background jobs + server action wrapper

**Goal** — Every booking fires a webhook. Webhook delivery is retried up to 3 times via a minimal tasker pattern. The tasker runs on a Next.js cron route. Bonus: build ONE server action that wraps `createCaller` — proving the "server actions as thin wrappers over tRPC" pattern.

**What you build**
- `WebhookSubscription` model + UI to register/test.
- `JobRun` model — mirrors cal.com's `Task` in `packages/features/tasker/repository.ts`. Fields: `id, type, payload, attempts, maxAttempts, scheduledFor, succeededAt, failedAt, lastError`.
- `scheduleWebhookDelivery(bookingId, event)` helper — writes a `JobRun` row.
- `/api/cron/tasks/route.ts` — processes the next 100 JobRuns. For each: fetch the webhook, sign the payload with `createHmac("sha256", secret).update(body).digest("hex")`, POST, handle failure (increment attempts, schedule retry with exponential backoff).
- Hook `bookings.commit` and `bookings.confirm` to `scheduleWebhookDelivery`.
- **Server Action bonus**: create `src/app/actions/confirmBooking.ts`:
  ```ts
  "use server";
  export async function confirmBookingAction(id: string) {
    const ctx = await createContextFromServerAction();
    const caller = createCallerFactory(appRouter)(ctx);
    return caller.bookings.confirm({ id });
  }
  ```
  Use this action from ONE place in the UI (maybe a form inside an email notification prototype page). Wire it with `useFormState` from `react-dom`.

**tRPC pattern learned** — HMAC webhooks; tasker pattern for retries; *server actions as thin wrappers over `createCaller`* — the exact pattern the user asked about. Same context logic, same middleware chain, just a different transport.

**Cal.com reference**
- Tasker pattern: `packages/features/tasker/README.md:9–94` — the conceptual reference, and `internal-tasker.ts:13–33` for the implementation.
- Webhook repository and scheduling: `packages/features/webhooks/lib/sendPayload.ts:1, 298` for `createHmac`, and `packages/features/webhooks/lib/scheduleTrigger.ts` for the scheduling side.
- Task model: `packages/features/tasker/repository.ts` — minimal `Task` repo pattern.
- Server actions wrapping tRPC: cal.com doesn't do this cleanly anywhere; the pattern is documented by tRPC itself at https://trpc.io/docs/server/server-side-calls — the section titled "Using `createCaller` with a Next.js Server Action."

**Prisma work** — `WebhookSubscription` and `JobRun` models.

**Hard subtask** — Make the retry schedule deterministic. Exponential backoff: `2^attempts * 10s` with jitter. The cron picks up only jobs where `scheduledFor <= now()`. Write a Vitest that simulates 4 failing attempts and verifies the next run happens at the right time.

**Success criteria**
- Confirming a booking → a POST arrives at `webhook.site` (test it with an ephemeral bin) with a `X-Officehours-Signature` header that verifies against your secret.
- Kill the receiver → after 3 cron runs (mock by calling the cron route 3 times), the job is marked `failedAt` and stops retrying.
- The server-action wrapped `confirmBooking` respects the same middleware chain (a VIEWER membership action gets `FORBIDDEN`).

**Est. time** — 5 days.

---

### Phase 11: Live queue via tRPC v11 SSE subscription

**Goal** — The host dashboard has a "Live queue" panel that streams new bookings, hold events, and cancellations via a tRPC `.subscription()` using Server-Sent Events. No polling.

**What you build**
- `bookings.queue({ hostId })` — an authed SSE subscription procedure. Yields `{ type: "held" | "booked" | "confirmed" | "cancelled", payload }` events.
- A small `EventBus` (just an `EventEmitter` singleton in `src/trpc/bus.ts`) that `slots.hold`, `bookings.commit`, and `bookings.confirm` emit to.
- The subscription handler reads from the bus:
  ```ts
  .subscription(async function* ({ input, ctx, signal }) {
    for await (const event of on(bus, `host:${input.hostId}`, { signal })) {
      yield event[0];
    }
  })
  ```
- Wire the tRPC client with `unstable_httpSubscriptionLink` (tRPC v11 SSE). Compose with the existing `splitLink`:
  ```ts
  splitLink({
    condition: (op) => op.type === "subscription",
    true: unstable_httpSubscriptionLink({ url: "/api/trpc", transformer: superjson }),
    false: /* existing splitLink here */,
  })
  ```
- The client component calls `trpc.bookings.queue.useSubscription({ hostId }, { onData: (event) => { ... invalidate or setQueryData ... } })`.
- When a `"held"` event arrives, prepend to the queue list optimistically via `setQueryData`. When a `"cancelled"` arrives, remove.

**tRPC pattern learned** — (7) Subscriptions via tRPC v11 SSE. Plus the link-composition insight that subscriptions need a *different transport* than regular queries/mutations.

**Cal.com reference**
- Cal.com has no production subscriptions (grep confirmed: `packages/trpc/server/routers` has zero `.subscription(` calls). The reference here is the tRPC v11 docs at https://trpc.io/docs/server/subscriptions and the `httpSubscriptionLink` client example. This is the phase where the user goes **past** cal.com's current patterns.

**Prisma work** — none.

**Hard subtask** — Make the subscription survive Next.js's route handler weirdness. App Router streams SSE through the response object, and the `signal` abort must actually close the `EventEmitter` listener or you leak. Write a stress test: open 5 tabs to the dashboard, close them, check that `bus.listenerCount("host:xxx")` goes back to zero.

**Success criteria**
- Open the host dashboard in one tab, the public page in another, hold a slot → the dashboard queue panel updates in <100ms without a page refresh.
- Network tab shows **one** hanging SSE connection per tab, not polling.
- Closing the dashboard tab → server-side listener count decrements. Leave it open overnight → still only one listener, no memory growth.

**Est. time** — 5 days.

---

### Phase 12 (optional stretch): Routing forms + conditional intake

**Goal** — A small flavor of cal.com's "Routing Forms": the intake form is dynamic per window. Window 1 asks for project URL + deadline; Window 2 asks for topic + urgency.

**What you build**
- `IntakeTemplate { windowId, fields: Json }` — `fields` is `[{ key, label, type: "text"|"select"|"date", required, options? }]`.
- An intake-template editor in the host dashboard (another `useFieldArray`).
- `bookings.commit` reads the template and validates `intake` against a Zod schema **built at runtime** from the template.

**tRPC pattern learned** — Runtime Zod schema construction — `z.object(Object.fromEntries(fields.map(...)))`. Paired with the dynamic form renderer in RHF.

**Cal.com reference** — `packages/features/bookings/lib/getBookingFields.ts` — dynamic field shape for cal.com bookings (read the first 200 lines).

**Success criteria** — Different windows show different intake forms without any code deploy.

**Est. time** — 1 week if you get to it. Skip if burnt out.

---

## 5. What you will NOT build (scope cut)

These Cal.com features are **traps**: they add weeks of complexity without teaching new tRPC/React-Query/Prisma concepts, or they repeat concepts you already know.

| Feature | Why skip |
|---|---|
| OAuth Google Calendar sync (`packages/app-store/googlecalendar/`) | A large integration with tokens, refresh, and webhook subscriptions to Google. Zero new tRPC concepts; mostly OAuth dance. |
| Paid bookings with Stripe (`packages/app-store/stripepayment/`) | Payment handling is its own domain. A phase in Dub territory. Only do it if you really want Stripe on your resume. |
| Organization / sub-team hierarchy (`Team` with `parentId`) | Recursive team trees + profile-per-org makes the Zod + middleware work much harder without teaching a new concept. `Membership` alone gives you the middleware-chain lesson. |
| i18n via `next-i18next` (`packages/i18n/locales/`) | You already did i18n in Rallly. Skip for this project. |
| The App Store pattern (`packages/app-store/`) | Massive, plugin-oriented. Not a tRPC lesson. |
| Legacy Pages Router leftovers (cal.com's `apps/web/pages/`) | Cal.com is mid-migration; don't copy legacy code. Stick to `apps/web/app/`. |
| `apps/api/v2` (NestJS REST API) | Different framework entirely. |
| Attribute Framework / RR weighting (`schema.prisma: Attribute/AttributeToUser`) | Only useful for Cal.com's round-robin assignment. |
| Insights / Analytics (`packages/features/insights/`) | Read-replica Prisma queries + heavy charts. Worth copying the "readonly Prisma" pattern from `packages/prisma/index.ts` in a note, but don't build the feature. |
| Delegation credentials, SAML, 2FA | Auth is not the lesson. |
| Instant meetings / Cal Video / transcription | Daily.co + recording + AI features. Tangential. |
| Workflows (`packages/features/ee/workflows/`) | SMS + email orchestration tree. Your `tasker` in phase 10 already teaches the async-job lesson. |

**The "copy 5000 LOC blind" trap**: when you open `handleNewBooking.ts`, it is a 2000+ line function. Do not port it. Read it once, take 5 notes, implement your own version in 100 lines. The point is to learn what a complicated booking handler *has to worry about* (idempotency, locks, webhooks, confirmation emails, timezone math), not to port cal.com's specific solutions.

---

## 6. How to read cal.com while building

The rule: **for each phase, read in the order below, then close the tabs.** Don't scroll laterally.

### Per-phase reading order

**Phase 1 (transformer + split)**
1. `packages/trpc/server/trpc.ts` (all 18 lines)
2. `packages/trpc/server/routers/viewer/availability/_router.tsx` — note the dynamic import pattern
3. Pick any `.handler.ts` and its `.schema.ts` pair (e.g., `availability/schedule/create.handler.ts` + `create.schema.ts`) and note how the handler imports the schema type and does no validation itself.

**Phase 2 (middleware + createCaller)**
1. `packages/trpc/server/trpc.ts` line 17 — the `createCallerFactory` export.
2. `packages/trpc/server/createContext.ts` — both `createContextInner` and `createContext`.
3. `apps/web/app/_trpc/context.ts` — `createRouterCaller` — 22 lines total.
4. `apps/web/app/(use-page-wrapper)/availability/[schedule]/page.tsx` — real usage.
5. `packages/trpc/server/procedures/authedProcedure.ts` + `middlewares/sessionMiddleware.ts` — the chain.

**Phase 3 (optimistic)**
1. Don't read cal.com. Read the tRPC v11 React Query docs: `useUtils().xxx.setData()`, `useUtils().xxx.cancel()`.
2. Optionally skim the TanStack Query docs on "Optimistic Updates".

**Phase 4 (schedule + superRefine)**
1. `packages/trpc/server/routers/viewer/oAuth/updateClient.schema.ts` — 30-line superRefine example.
2. `packages/features/schedules/services/ScheduleService.ts` first 150 lines — the ZUpdateInputSchema.
3. `packages/features/schedules/components/ScheduleComponent.tsx` — specifically `useFieldArray` usage around lines 12, 69–137 (`ScheduleDay` + the copy button pattern lines 139–181).

**Phase 5 (SSR + hydration)**
1. `apps/web/app/(use-page-wrapper)/(main-nav)/event-types/page.tsx` — the `unstable_cache(createRouterCaller(...))` pattern.
2. tRPC v11 docs page: "Server Components" — the HydrationBoundary pattern is not in cal.com.

**Phase 6 (links + rate limit + $transaction)**
1. `packages/trpc/react/trpc.ts` lines 70–96 — splitLink composition.
2. `apps/web/app/_trpc/trpc-client.ts` lines 42–80 — App Router version.
3. `packages/features/bookings/lib/handleSeats/create/createNewSeat.ts` lines 41–110 — the `$transaction` + `FOR UPDATE` pattern.
4. `packages/trpc/server/procedures/authedProcedure.ts` lines 7–29 — commented-out rate limiter.

**Phase 7 (idempotency + multi-write transaction)**
1. `packages/prisma/schema.prisma` line 855 — `idempotencyKey` field.
2. `packages/trpc/server/routers/viewer/bookings/requestReschedule.handler.ts` — similar "delete one, create one" pattern.

**Phase 8 (Postgres + multi-list optimistic)**
1. Prisma docs on migrating providers — not cal.com.
2. tRPC docs on `useUtils().xxx.setData(filters, ...)`.
3. `packages/features/bookings/lib/handlePayment.ts` first 100 lines for Decimal handling.

**Phase 9 (PBAC + middleware chain)**
1. `packages/trpc/server/procedures/pbacProcedures.ts` — read the entire file.
2. `packages/trpc/server/middlewares/sessionMiddleware.ts` — `unstable_pipe` example at line 26.

**Phase 10 (tasker + webhooks)**
1. `packages/features/tasker/README.md` — 94 lines, conceptual.
2. `packages/features/tasker/internal-tasker.ts` — 33 lines, real impl.
3. `packages/features/tasker/repository.ts` — the Task model usage.
4. `packages/features/webhooks/lib/sendPayload.ts` lines 1, 296–310 — the `createHmac` part only.

**Phase 11 (SSE subscriptions)**
1. tRPC v11 docs: "Subscriptions" page + `httpSubscriptionLink`.
2. Do **not** read cal.com — they don't have subscriptions.

### What to copy vs what NOT to copy

**Copy (patterns):**
- The `_router.tsx` + `*.handler.ts` + `*.schema.ts` file-split discipline.
- The `createContextInner`/`createContext` split (for testing + server-side calling).
- The `unstable_pipe` composition for middleware.
- The `$transaction` + row-lock pattern.
- The `createHmac("sha256")` webhook signature shape.
- The `idempotencyKey` field + transaction-level check.

**Do NOT copy:**
- Any `@calcom/*` import — you are not in a monorepo and don't need workspace aliases.
- The `ENDPOINTS` array splitting (`packages/trpc/react/shared.ts`). That's for deploying one tRPC router per lambda function on Vercel. You have one lambda; you don't need it.
- The `zod-prisma-types` generator. Overkill for this scope. Write your Zod schemas by hand so you *learn* them.
- The Kysely generator. Same.
- The `zod-utils.ts` file with `eventTypeLocations`, `bookingResponses`, etc. Those are cal.com's business types. Write yours from scratch.
- Anything in `packages/features/ee/*` — explicitly enterprise code, cut in cal.diy, probably cut in your scope.

---

## 7. After the roadmap

### What this portfolio project demonstrates if completed
By phase 11, you'll have a real-world production Next.js app that demonstrates, with commit history showing each phase in sequence:

- tRPC v11 with every link type (batch, direct, subscription, split)
- All seven tRPC patterns from your original target list, in production code with tests
- SSR prefetch + hydration, server-side calling, optimistic updates across multiple query keys, middleware chain composition with type-level context accumulation, SSE subscriptions, superjson for Date/Decimal, runtime-built Zod schemas
- `$transaction` with row locks, idempotency keys, HMAC webhooks, cron-based tasker
- Timezone-safe scheduling (Temporal or date-fns-tz), not Dayjs-only
- A public unauthenticated flow (slot hold → booking) and an authed dashboard flow in the same app — a level of scope few pet projects reach

This is a strong rebuttal to "tRPC learner shipped a todo list." You will have written a real scheduler.

### Next codebase after this (one recommendation)
**[Plane](https://github.com/makeplane/plane)** or **[Twenty](https://github.com/twentyhq/twenty)**.

Plane is a project-management tool (Linear-like) — Python/Django backend, but Next.js frontend using tRPC-style typed API layers + Zustand heavily. It's the natural next step because:
- You've mastered tRPC server-side patterns in this project. Plane's frontend has far more **client-side state orchestration** (drag-drop Kanban, multi-level nesting, real-time collaboration via WebSockets) than cal.com, which is mostly form-centric.
- Plane uses the `use-sync-external-store` + Zustand pattern aggressively. You've already seen `createWithEqualityFn` in cal.com's `BookerStoreProvider`; Plane goes deeper.
- If you want to stay full TypeScript, Twenty is an alternative — all-TS, uses tRPC + Prisma + GraphQL. Pick Twenty if you want tRPC+GraphQL layering; pick Plane if you want real-time collaboration patterns.

Either way, **after** shipping Officehours, you'll have enough production-grade TypeScript fluency to read those codebases in days rather than weeks.

---

*Total estimated time: 6–10 weeks of part-time work (4–8 hrs/week). Phases 1–8 are the must-do core (tRPC skill targets 1–6). Phases 9–11 unlock skill target 7 (subscriptions) and the middleware-chain insight. Phase 12 is dessert.*
