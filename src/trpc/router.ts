import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { DayOfWeek } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { initTRPC, TRPCError, tracked } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";
import { generateUpcomingSlots } from "@/lib/schedule";
import { bookingInputSchema } from "@/lib/booking-schema";
import { handleSchema, registerInputSchema } from "@/lib/register-schema";
import { createRatelimit, type Duration } from "@/lib/rate-limit";
import { withSpan } from "@/lib/observability";
import { hashPassword } from "@/lib/password";
import {
  cancelPendingTask,
  findActiveSubscriptionsForEvent,
  scheduleEmailSend,
  scheduleWebhookDelivery,
  TASK_TYPE_EMAIL_SEND,
} from "@/lib/tasks";
import {
  emitBookingEvent,
  iterateBookingEvents,
  type BookingBusEvent,
} from "@/trpc/bus";
import {
  FEATURE_DEFAULTS,
  getEnabledFeatures,
  isFeatureEnabled,
} from "@/lib/feature-flags";
import { timezoneSchema } from "@/lib/timezone";
import {
  WORKSPACE_SCOPES,
  WORKSPACE_SLUG_REGEX,
  INVITATION_EXPIRY_MS,
  generateInvitationToken,
  hasScope,
  scopesFor,
  type WorkspaceScope,
} from "@/lib/workspaces";
import { generateApiKey } from "@/lib/api-keys";
import {
  fetchHostBusyTimes,
  getCalendarAdapter,
  googleAuthUrl,
  microsoftAuthUrl,
  subtractBusyTimes,
} from "@/lib/calendar";
import {
  cancelPendingWorkflowTasks,
  dispatchWorkflows,
  type WorkflowBookingContext,
} from "@/lib/workflows";

// Form keys like "mon" map to the Prisma enum values.
const DAY_KEY_TO_ENUM = {
  mon: DayOfWeek.MONDAY,
  tue: DayOfWeek.TUESDAY,
  wed: DayOfWeek.WEDNESDAY,
  thu: DayOfWeek.THURSDAY,
  fri: DayOfWeek.FRIDAY,
  sat: DayOfWeek.SATURDAY,
  sun: DayOfWeek.SUNDAY,
} as const;
type DayKey = keyof typeof DAY_KEY_TO_ENUM;

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const rangeSchema = z
  .object({
    from: z.string().regex(timeRegex, "HH:MM"),
    to: z.string().regex(timeRegex, "HH:MM"),
  })
  .refine((r) => r.from < r.to, {
    message: "End must be after start",
    path: ["to"],
  });
const daySchema = z.object({
  enabled: z.boolean(),
  ranges: z.array(rangeSchema),
});
const scheduleInputSchema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
});

const t = initTRPC.context<Context>().create({
  // tRPC v11 SSE config (verified via Context7 against the v11
  // subscriptions docs). `ping` keeps proxies/load-balancers from
  // killing idle connections after their default timeout (often 30s).
  // `reconnectAfterInactivityMs` is a client-side hint — the
  // subscriber auto-reconnects if no event or ping arrives in the
  // window. Both numbers are deliberate: ping must be < the smallest
  // proxy idle timeout you might be behind, reconnect must be > ping
  // interval so a single missed ping doesn't trigger a reconnect.
  sse: {
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

const middleware = t.middleware;

const publicProcedure = t.procedure;

const isAuthed = middleware(async (opts) => {
  // opts.ctx — the current context (user, session, etc.)
  // opts.next() — continue to the next middleware or the procedure

  if (!opts.ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      // Narrow `user.id` from `string | undefined` to `string` for
      // downstream procedures — required for non-null foreign keys.
      user: { ...opts.ctx.user, id: opts.ctx.user.id },
    },
  });
});

const privateProcedure = publicProcedure.use(isAuthed);

// Admin gate — looks up the logged-in user's handle and checks it
// against OFFICEHOURS_ADMIN_HANDLES (CSV env). Cheap because users.me
// already runs on every authed request and the lookup is keyed on
// the indexed unique `id`. Rejects with FORBIDDEN, not UNAUTHORIZED —
// the user IS logged in, they just don't have the role.
const isAdmin = middleware(async (opts) => {
  if (!opts.ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const me = await prisma.user.findUnique({
    where: { id: opts.ctx.user.id },
    select: { handle: true },
  });
  const { isAdminHandle } = await import("@/lib/admin");
  if (!isAdminHandle(me?.handle)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin only.",
    });
  }
  return opts.next({
    ctx: { user: { ...opts.ctx.user, id: opts.ctx.user.id } },
  });
});

const adminProcedure = publicProcedure.use(isAdmin);

// Rate-limit middleware factory — port of rallly's
// createRateLimitMiddleware (apps/web/src/trpc/trpc.ts:134-174). The
// limiter instance is created ONCE per `name` at module load; the
// returned middleware is stateless and just calls .limit().
//
// Bucketing key shape: `${name}:${ctx.ipIdentifier}`. Including the
// procedure name keeps namespaces clean — `bookings.create` doesn't
// share a bucket with a future `slots.hold`.
function createRateLimitMiddleware(
  name: string,
  requests: number,
  duration: Duration,
) {
  const ratelimit = createRatelimit(requests, duration);

  return middleware(async ({ ctx, next }) => {
    const { success } = await ratelimit.limit(`${name}:${ctx.ipIdentifier}`);
    if (!success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Wait a minute and try again.",
      });
    }
    return next();
  });
}

const router = t.router;

const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "availability",
  "bookings",
  "h",
  "login",
  "me",
  "profile",
  "register",
  "root",
  "settings",
  "www",
]);

function uniqueConstraintIncludes(cause: unknown, field: "email" | "handle") {
  if (
    !(cause instanceof Prisma.PrismaClientKnownRequestError) ||
    cause.code !== "P2002"
  ) {
    return false;
  }

  const target = cause.meta?.target;
  if (Array.isArray(target)) {
    return target.some((item) => item === field);
  }
  return typeof target === "string" && target.includes(field);
}

function handleConflict(message = "That handle is taken. Pick another.") {
  return new TRPCError({
    code: "CONFLICT",
    message,
  });
}

function emailConflict() {
  return new TRPCError({
    code: "CONFLICT",
    message: "That email is already registered.",
  });
}

// Exposed for tests + future server-action wrappers. tRPC v11's
// createCallerFactory needs to be called from the same `t` instance
// the router was built with so the Context type matches; exporting
// it here keeps the type chain intact for any caller.
export const createCaller = t.createCallerFactory;

const schedule = router({
  // Returns all AvailabilityRange rows for the logged-in user, sorted
  // by day then start time. Client groups them into the weekly form shape.
  get: privateProcedure.query(async ({ ctx }) => {
    return await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }),

  // Replaces the user's whole schedule in one transaction:
  // delete all existing rows, insert the new set built from the form payload.
  // Days with enabled=false or empty ranges produce zero rows (implicitly off).
  save: privateProcedure
    .input(scheduleInputSchema)
    .mutation(async ({ input, ctx }) => {
      const rows = (Object.entries(input) as [DayKey, typeof input.mon][])
        .filter(([, day]) => day.enabled && day.ranges.length > 0)
        .flatMap(([key, day]) =>
          day.ranges.map((r) => ({
            userId: ctx.user.id,
            dayOfWeek: DAY_KEY_TO_ENUM[key],
            startTime: r.from,
            endTime: r.to,
          })),
        );

      try {
        await prisma.$transaction([
          prisma.availabilityRange.deleteMany({
            where: { userId: ctx.user.id },
          }),
          prisma.availabilityRange.createMany({ data: rows }),
        ]);
      } catch (cause) {
        // Expected failures reach here (DB offline, constraint violation, etc.).
        // Throw a TRPCError so the client sees a clean message while the
        // original error is still available for server-side logs via `cause`.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your schedule. Try again.",
          cause,
        });
      }

      return { count: rows.length };
    }),

  // Public endpoint powering /h/[handle]. Look up the user by handle, read
  // their availability ranges, and generate back-to-back fixed-length slots
  // starting from "now" for the next N days. Past times on day 0 are skipped.
  getUpcomingSlots: publicProcedure
    .input(
      z.object({
        handle: z.string(),
        days: z.number().int().min(1).max(14).default(7),
      }),
    )
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true, timezone: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const ranges = await prisma.availabilityRange.findMany({
        where: { userId: user.id },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });

      const allSlots = generateUpcomingSlots({
        ranges,
        from: new Date(),
        days: input.days,
        stepMinutes: 15,
        hostTimezone: user.timezone,
      });

      if (allSlots.length === 0) {
        return [];
      }

      // Pull busy ranges from every selected calendar across the
      // host's connected providers. Any slot overlapping a busy
      // range gets dropped (B3). When no calendar is connected
      // fetchHostBusyTimes returns [] and subtractBusyTimes is a
      // no-op pass-through.
      const horizonStart = new Date(allSlots[0].start);
      const horizonEnd = new Date(allSlots[allSlots.length - 1].end);
      const busy = await fetchHostBusyTimes({
        hostId: user.id,
        from: horizonStart,
        to: horizonEnd,
      });
      const slots = subtractBusyTimes(allSlots, busy);

      if (slots.length === 0) {
        return [];
      }

      const bookings = await prisma.booking.findMany({
        where: {
          hostId: user.id,
          deleted: false,
          slotStart: {
            gte: new Date(slots[0].start),
            lte: new Date(slots[slots.length - 1].end),
          },
        },
        select: {
          slotStart: true,
        },
      });

      const takenStarts = new Set(
        bookings.map((booking) => booking.slotStart.getTime()),
      );

      return slots.map((slot) => {
        const status: "open" | "taken" = takenStarts.has(
          new Date(slot.start).getTime(),
        )
          ? "taken"
          : "open";

        return {
          ...slot,
          status,
        };
      });
  }),
});

const auth = router({
  handleAvailability: publicProcedure
    .input(z.object({ handle: handleSchema }))
    .query(async ({ input }) => {
      if (RESERVED_HANDLES.has(input.handle)) {
        return { available: false as const };
      }

      const existing = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true },
      });

      return { available: existing === null };
    }),

  register: publicProcedure
    .use(createRateLimitMiddleware("auth.register", 5, "1 m"))
    .input(registerInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "auth.register",
          op: "user.write",
          attributes: {
            handle: input.handle,
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async () => {
          if (RESERVED_HANDLES.has(input.handle)) {
            throw handleConflict();
          }

          const existingEmail = await prisma.user.findUnique({
            where: { email: input.email },
            select: { id: true },
          });
          if (existingEmail) {
            throw emailConflict();
          }

          const existingHandle = await prisma.user.findUnique({
            where: { handle: input.handle },
            select: { id: true },
          });
          if (existingHandle) {
            throw handleConflict();
          }

          const passwordHash = await hashPassword(input.password);

          try {
            return await prisma.user.create({
              data: {
                email: input.email,
                handle: input.handle,
                passwordHash,
              },
              select: {
                id: true,
                email: true,
                handle: true,
              },
            });
          } catch (cause) {
            if (uniqueConstraintIncludes(cause, "email")) {
              throw emailConflict();
            }
            if (uniqueConstraintIncludes(cause, "handle")) {
              throw handleConflict();
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not create your account. Try again.",
              cause,
            });
          }
        },
      ),
    ),
});

const users = router({
  // Minimal "me" projection — just the fields the settings form needs.
  // Returning the whole User record would leak passwordHash, attempts, etc.
  me: privateProcedure.query(async ({ ctx }) => {
    return await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      // email is included so the settings danger-zone confirms against
      // the live account email rather than re-querying. Private
      // procedure — only the logged-in user sees their own row.
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
      },
    });
  }),

  // Per-user feature flag map. Returns every known flag's resolved
  // state so the client can gate UI without a network roundtrip per
  // flag check. Cached client-side via the standard react-query
  // staleTime; flags that flip on the server take effect on the next
  // refetch (or SSR boundary).
  featureFlags: privateProcedure.query(async ({ ctx }) => {
    return getEnabledFeatures(ctx.user.id);
  }),

  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        // timezone is public — visitors need it to label the slot
        // picker ("Times shown in Pacific time"). No PII; no email/hash.
        select: {
          id: true,
          name: true,
          handle: true,
          image: true,
          timezone: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  // Atomic handle update with unique-constraint error mapping:
  // if another user already owns the handle, throw CONFLICT so the
  // client can attach the error to the handle field instead of showing
  // a generic 500.
  setHandle: privateProcedure
    .input(z.object({ handle: handleSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        await prisma.user.update({
          where: { id: ctx.user.id },
          data: { handle: input.handle },
        });
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That handle is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your handle. Try again.",
          cause,
        });
      }
      return { handle: input.handle };
    }),

  // Update the host's IANA timezone. Validated through `timezoneSchema`
  // which round-trips the string through Intl.DateTimeFormat — typos
  // and fixed-offset zones get rejected with a precise error.
  setTimezone: privateProcedure
    .input(z.object({ timezone: timezoneSchema }))
    .mutation(async ({ input, ctx }) => {
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),

  // Account deletion. Cascades through every relation onDelete:
  // Cascade (Account, Session, AvailabilityRange, Booking,
  // WebhookSubscription, UserFeatures, Authenticator). BookingAudit
  // explicitly does NOT have a FK to Booking (see schema.prisma) —
  // audit rows survive deletion and stay queryable by bookingUid.
  //
  // Email confirmation is enqueued BEFORE the delete commits. The
  // email payload is self-contained (template + props serialized as
  // JSON in the Task row) so it survives the User row's deletion.
  // If the cron later finds the user gone, the email still sends
  // because nothing in runEmailSend reads back from User.
  //
  // The handler does not call signOut() — that's a client-side
  // concern (the session cookie lives in the browser, not in this
  // procedure's view). The DeleteAccountDialog awaits this mutation
  // then triggers next-auth signOut() on the client.
  deleteAccount: privateProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { email: true, name: true, handle: true },
    });

    const hostName = user.name ?? user.handle ?? "Officehours user";
    const operationId = crypto.randomUUID();

    await scheduleEmailSend({
      payload: {
        to: user.email,
        template: "account-deleted",
        props: {
          hostName,
          deletedAtIso: new Date().toISOString(),
        },
      },
      // Bind to userId + operationId — re-running the procedure (not
      // idempotent on the user row, but the email enqueue is) won't
      // double-send.
      referenceUid: `user:${ctx.user.id}:account-deleted:${operationId}`,
    });

    await prisma.user.delete({ where: { id: ctx.user.id } });

    return { ok: true as const };
  }),
});

const SLOT_MINUTES = 15;
// How far in advance to fire the visitor reminder email. cal.com's
// workflow defaults to 60 minutes pre-event; matches a "I'm about to
// jump on a call" mental model without spamming the inbox.
const REMINDER_LEAD_MS = 60 * 60 * 1000;
const bookingConfirmationInputSchema = z.object({
  handle: z.string().min(1),
  bookingUid: z.string().min(1),
});

const bookings = router({
  // Public: any visitor can book. Validates that the slot actually
  // falls within the host's availability (matching the client's
  // advertised list), then writes the booking. A `@@unique([hostId,
  // slotStart])` constraint on the table stops double-books at the DB
  // level — Prisma's P2002 maps to TRPCError CONFLICT so the form can
  // show a friendly "that slot was just taken" message.
  create: publicProcedure
    // 10 requests / minute / IP — matches cal.com's `core` bucket
    // (packages/lib/rateLimit.ts). Generous enough for a real visitor
    // who hits validation errors and retries; tight enough to throttle
    // a curl loop or a runaway script.
    .use(createRateLimitMiddleware("bookings.create", 10, "1 m"))
    .input(bookingInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.create",
          op: "booking.write",
          attributes: {
            // Same idempotencyKey + ipIdentifier the limiter buckets
            // by — lets log lines correlate with the rate-limit
            // headers and the BookingAudit row's operationId field.
            idempotencyKey: input.idempotencyKey,
            ipIdentifier: ctx.ipIdentifier,
            handle: input.handle,
          },
        },
        async (span) => {
      const bookingSelect = {
        id: true,
        publicUid: true,
        slotStart: true,
        slotEnd: true,
      } as const;

      // Idempotency short-circuit. If the visitor's form has already
      // produced a booking for this UUID, return it as-is without
      // re-running validation. Skips the "slot is in the past" check
      // when a retry happens late, and skips a wasteful slot scan.
      // Mirrors cal.com Booking.idempotencyKey semantics.
      //
      // Note: filter deleted=false. If the booking with this key was
      // soft-deleted (host cancelled), don't return it as if the
      // submit succeeded — let the user create a new one. (When
      // soft-delete fires, idempotencyKey is also nulled out, so the
      // findUnique below would miss anyway. This filter is belt-and-
      // suspenders.)
      const existingByKey = await prisma.booking.findFirst({
        where: { idempotencyKey: input.idempotencyKey, deleted: false },
        select: bookingSelect,
      });
      if (existingByKey) {
        span.setAttribute("idempotencyHit", true);
        return existingByKey;
      }

      const host = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: {
          id: true,
          name: true,
          handle: true,
          timezone: true,
          email: true,
        },
      });
      if (!host) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Host not found",
        });
      }

      const slotStart = new Date(input.slotStart);
      if (Number.isNaN(slotStart.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid slot timestamp",
        });
      }
      if (slotStart.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That slot is in the past",
        });
      }

      // Reuse the same generator the public page uses so the
      // server's definition of "available" is identical to the
      // client's. Scanning 14 days forward covers any slot the
      // visitor could plausibly have been shown.
      const ranges = await prisma.availabilityRange.findMany({
        where: { userId: host.id },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
      const upcoming = generateUpcomingSlots({
        ranges,
        from: new Date(),
        days: 14,
        stepMinutes: SLOT_MINUTES,
        hostTimezone: host.timezone,
      });
      const isValid = upcoming.some((s) => s.start === input.slotStart);
      if (!isValid) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That slot isn't available anymore",
        });
      }

      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);

      // One UUID per request, shared by the audit row written below
      // and (eventually) by webhook deliveries / email tasks fired off
      // the same user action. Lets logs group every side effect of one
      // submit by `operationId`.
      const operationId = crypto.randomUUID();
      span.setAttribute("operationId", operationId);

      // Attribution from the oh_ref_<handle> cookie set in proxy.ts
      // when the visitor first landed via a ?ref= link. Server-side
      // only — never trusted from the input. Mirrors dub.co's clickId
      // → conversion thread shrunk to single-host scope.
      const referrer = ctx.cookies.get(`oh_ref_${input.handle}`) ?? null;
      if (referrer) span.setAttribute("referrer", referrer);

      try {
        // $transaction(async tx => ...) — slot collision check +
        // booking write + audit row commit atomically. SQLite
        // serializes transactions, so the findFirst-then-create
        // window is race-free even under concurrent submits to the
        // same slot.
        //
        // Replaces the previous @@unique([hostId, slotStart]) +
        // P2002 catch — the unique constraint had to go to allow
        // soft-deleted rebooking. App-level enforcement is what
        // remains.
        const booking = await prisma.$transaction(async (tx) => {
          // Idempotency re-check INSIDE the transaction. The findUnique
          // before the validate-and-transact phase is the fast-path
          // optimization (skip validation when we already know we're a
          // retry). But three concurrent retries with the same key all
          // see "no row" in that fast-path lookup, then race into the
          // transaction together — without this re-check, the loser
          // would trip the slot-collision branch below and surface
          // CONFLICT instead of the existing booking. SQLite
          // serializes commits, so this lookup sees any row a prior
          // transaction wrote.
          const existingByKeyInTx = await tx.booking.findFirst({
            where: { idempotencyKey: input.idempotencyKey, deleted: false },
            select: bookingSelect,
          });
          if (existingByKeyInTx) {
            span.setAttribute("idempotencyHitInTx", true);
            return existingByKeyInTx;
          }

          const slotCollision = await tx.booking.findFirst({
            where: { hostId: host.id, slotStart, deleted: false },
            select: { id: true },
          });
          if (slotCollision) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Someone just grabbed that slot. Pick another.",
            });
          }

          const created = await tx.booking.create({
            data: {
              hostId: host.id,
              visitorName: input.visitorName,
              visitorEmail: input.visitorEmail,
              question: input.question,
              slotStart,
              slotEnd,
              idempotencyKey: input.idempotencyKey,
              referrer,
              visitorTimezone: input.visitorTimezone ?? null,
            },
            select: bookingSelect,
          });

          await tx.bookingAudit.create({
            data: {
              bookingUid: created.publicUid,
              actor: "VISITOR",
              action: "CREATED",
              // Self-contained snapshot — survives the booking row's
              // eventual deletion. Dates as ISO strings for portable JSON.
              data: {
                hostId: host.id,
                visitorName: input.visitorName,
                visitorEmail: input.visitorEmail,
                question: input.question ?? null,
                slotStart: created.slotStart.toISOString(),
                slotEnd: created.slotEnd.toISOString(),
                idempotencyKey: input.idempotencyKey,
                referrer,
              },
              operationId,
            },
          });

          return created;
        });
        span.setAttribute("bookingPublicUid", booking.publicUid);

        // Fan out the booking.created event to active webhooks. This
        // intentionally runs OUTSIDE the $transaction — webhook delivery
        // is best-effort, async, and a delivery-side failure must NOT
        // roll back the booking write the visitor just confirmed.
        // Same pattern as cal.com's bookings → scheduleTrigger flow
        // (packages/features/webhooks/lib/scheduleTrigger.ts).
        const subscriptions = await findActiveSubscriptionsForEvent(
          host.id,
          "booking.created",
        );
        for (const sub of subscriptions) {
          await scheduleWebhookDelivery({
            payload: {
              webhookSubscriptionId: sub.id,
              event: "booking.created",
              body: {
                event: "booking.created",
                operationId,
                booking: {
                  publicUid: booking.publicUid,
                  slotStart: booking.slotStart.toISOString(),
                  slotEnd: booking.slotEnd.toISOString(),
                  visitorName: input.visitorName,
                  visitorEmail: input.visitorEmail,
                  question: input.question ?? null,
                },
                host: {
                  handle: input.handle,
                  id: host.id,
                },
                createdAt: new Date().toISOString(),
              },
            },
            referenceUid: `${booking.publicUid}:booking.created:${sub.id}`,
          });
        }
        span.setAttribute("webhooksScheduled", subscriptions.length);

        // Email fan-out — visitor gets booking-created. Host already
        // has the SSE live queue + dashboard, so no host email on
        // create (cancel emails both parties since the visitor learns
        // about it asynchronously). Same pattern as webhook delivery:
        // queued via Task, processed off-path so a Resend hiccup
        // can't roll back the booking write.
        const hostName = host.name ?? host.handle ?? "your host";
        const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const confirmationUrl = `${appUrl}/h/${input.handle}/booked/${booking.publicUid}`;
        await scheduleEmailSend({
          payload: {
            to: input.visitorEmail,
            template: "booking-created",
            props: {
              hostName,
              visitorName: input.visitorName,
              slotStartIso: booking.slotStart.toISOString(),
              question: input.question ?? null,
              confirmationUrl,
            },
          },
          referenceUid: `${booking.publicUid}:email:booking-created:visitor`,
        });

        // Reminder email — scheduled 1h before slotStart. The
        // existing process-tasks cron picks it up when due (Task
        // model's `scheduledAt` filter). Skip if the booking is
        // already <1h away — sending a reminder for a slot that's
        // imminent or already passed is noise. Cancel/reschedule
        // mark this row as superseded so the cron skips it.
        const reminderAt = new Date(
          booking.slotStart.getTime() - REMINDER_LEAD_MS,
        );
        if (reminderAt.getTime() > Date.now()) {
          await scheduleEmailSend({
            payload: {
              to: input.visitorEmail,
              template: "booking-reminder",
              props: {
                hostName,
                visitorName: input.visitorName,
                slotStartIso: booking.slotStart.toISOString(),
                confirmationUrl,
              },
            },
            referenceUid: `${booking.publicUid}:email:booking-reminder:visitor`,
            scheduledAt: reminderAt,
          });
        }

        // Workflow engine (B4). User-configurable rules layer on top
        // of the hardcoded reminder above. Dispatch fires for both
        // EVENT_CREATED (immediate) and BEFORE_EVENT (scheduled at
        // slotStart - offsetMinutes) triggers.
        const workflowCtx: WorkflowBookingContext = {
          bookingPublicUid: booking.publicUid,
          hostId: host.id,
          hostName,
          hostEmail: host.email,
          hostHandle: input.handle,
          visitorName: input.visitorName,
          visitorEmail: input.visitorEmail,
          question: input.question ?? null,
          slotStartIso: booking.slotStart.toISOString(),
          slotEndIso: booking.slotEnd.toISOString(),
          operationId,
        };
        await dispatchWorkflows({
          trigger: "EVENT_CREATED",
          booking: workflowCtx,
        });
        await dispatchWorkflows({
          trigger: "BEFORE_EVENT",
          booking: workflowCtx,
        });

        // Live queue fan-out — fires the host's SSE channel (see
        // src/trpc/bus.ts) so any open dashboard tab gets the event
        // in <100ms with no polling. Synchronous emit, no await; the
        // bus is in-memory.
        emitBookingEvent({
          type: "created",
          bookingPublicUid: booking.publicUid,
          hostId: host.id,
          visitorName: input.visitorName,
          slotStart: booking.slotStart.toISOString(),
          occurredAt: new Date().toISOString(),
        });

        return booking;
      } catch (cause) {
        // Re-throw TRPCErrors as-is (slot collision from inside the
        // transaction, etc). The catch is here to wrap unknown
        // errors and the idempotencyKey race.
        if (cause instanceof TRPCError) throw cause;

        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          // Only constraint left that can fire P2002: idempotencyKey.
          // Race protection — between the findFirst short-circuit and
          // the create, a parallel request with the same key landed.
          // Look it up and return it instead of throwing.
          const raced = await prisma.booking.findFirst({
            where: { idempotencyKey: input.idempotencyKey, deleted: false },
            select: bookingSelect,
          });
          if (raced) return raced;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create booking. Try again.",
          cause,
        });
      }
        },
      ),
    ),

  getPublicConfirmation: publicProcedure
    .input(bookingConfirmationInputSchema)
    .query(async ({ input }) => {
      const booking = await prisma.booking.findFirst({
        where: {
          publicUid: input.bookingUid,
          deleted: false,
          host: {
            handle: input.handle,
          },
        },
        select: {
          publicUid: true,
          slotStart: true,
          slotEnd: true,
          host: {
            select: {
              name: true,
              handle: true,
              image: true,
            },
          },
        },
      });

      if (!booking) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found",
        });
      }

      return booking;
    }),

  // Host-side soft-delete. Sets deleted=true, deletedAt=now(), and
  // nulls out idempotencyKey so the cleanup window can hard-delete
  // safely AND a future booking can reuse the slot. Writes a
  // BookingAudit row in the same $transaction so audit can never
  // miss a state change. Schedules booking.cancelled webhook fan-out
  // outside the transaction (delivery failure must not roll back the
  // cancel).
  cancel: privateProcedure
    .input(z.object({ publicUid: z.string().min(1) }))
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.cancel",
          op: "booking.write",
          attributes: { publicUid: input.publicUid, hostId: ctx.user.id },
        },
        async (span) => {
          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          const result = await prisma.$transaction(async (tx) => {
            // Look up + ownership check in one query. findFirst
            // (not findUnique) so the deleted=false filter applies.
            const target = await tx.booking.findFirst({
              where: {
                publicUid: input.publicUid,
                hostId: ctx.user.id,
                deleted: false,
              },
              select: {
                id: true,
                publicUid: true,
                visitorName: true,
                visitorEmail: true,
                question: true,
                slotStart: true,
                slotEnd: true,
                hostId: true,
                idempotencyKey: true,
              },
            });
            if (!target) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Booking not found or already cancelled",
              });
            }

            await tx.booking.update({
              where: { id: target.id },
              data: {
                deleted: true,
                deletedAt: new Date(),
                // Free the unique index entry so a future booking
                // can reuse the key. NULL doesn't trip @unique.
                idempotencyKey: null,
              },
            });

            await tx.bookingAudit.create({
              data: {
                bookingUid: target.publicUid,
                actor: "HOST",
                action: "CANCELLED",
                data: {
                  hostId: target.hostId,
                  visitorName: target.visitorName,
                  visitorEmail: target.visitorEmail,
                  question: target.question ?? null,
                  slotStart: target.slotStart.toISOString(),
                  slotEnd: target.slotEnd.toISOString(),
                  // Capture what the previous idempotencyKey was at
                  // cancel time — useful for forensics.
                  previousIdempotencyKey: target.idempotencyKey,
                },
                operationId,
              },
            });

            return target;
          });

          // Webhook fan-out — same pattern as bookings.create. Outside
          // the transaction so a delivery-side failure can't roll back
          // the cancel the host just confirmed.
          const subscriptions = await findActiveSubscriptionsForEvent(
            ctx.user.id,
            "booking.cancelled",
          );
          for (const sub of subscriptions) {
            await scheduleWebhookDelivery({
              payload: {
                webhookSubscriptionId: sub.id,
                event: "booking.cancelled",
                body: {
                  event: "booking.cancelled",
                  operationId,
                  booking: {
                    publicUid: result.publicUid,
                    slotStart: result.slotStart.toISOString(),
                    slotEnd: result.slotEnd.toISOString(),
                    visitorName: result.visitorName,
                    visitorEmail: result.visitorEmail,
                  },
                  cancelledAt: new Date().toISOString(),
                },
              },
              referenceUid: `${result.publicUid}:booking.cancelled:${sub.id}`,
            });
          }
          span.setAttribute("webhooksScheduled", subscriptions.length);

          // Cancel any pending reminder Task. updateMany filters on
          // succeededAt: null so a reminder that already fired (e.g.
          // host cancels right after the email lands) doesn't get
          // re-marked. No-op + 0 count when no reminder was queued
          // (booking was <1h away at create time).
          await cancelPendingTask({
            referenceUid: `${result.publicUid}:email:booking-reminder:visitor`,
            type: TASK_TYPE_EMAIL_SEND,
          });
          // Cancel pending workflow tasks tied to this booking — a
          // BEFORE_EVENT rule scheduled in the future shouldn't fire
          // after the slot was cancelled. Already-succeeded tasks
          // are filtered out by the prefix-match's succeededAt:
          // null clause.
          await cancelPendingWorkflowTasks(result.publicUid);

          // Email fan-out — both parties get notified on cancel. The
          // visitor was waiting for this slot; the host gets a record
          // outside the SSE/dashboard channel so a cancellation that
          // happens while the dashboard is closed still surfaces.
          // Reference uid binds to the cancel operation, not the
          // booking publicUid, so an eventual re-booking + cancel
          // doesn't dedup against the prior round.
          const hostUser = await prisma.user.findUnique({
            where: { id: ctx.user.id },
            select: { name: true, handle: true, email: true },
          });
          const hostName =
            hostUser?.name ?? hostUser?.handle ?? "your host";
          await scheduleEmailSend({
            payload: {
              to: result.visitorEmail,
              template: "booking-cancelled",
              props: {
                hostName,
                visitorName: result.visitorName,
                slotStartIso: result.slotStart.toISOString(),
              },
            },
            referenceUid: `${result.publicUid}:email:booking-cancelled:visitor:${operationId}`,
          });
          if (hostUser?.email) {
            await scheduleEmailSend({
              payload: {
                to: hostUser.email,
                template: "booking-cancelled-host",
                props: {
                  hostName,
                  visitorName: result.visitorName,
                  visitorEmail: result.visitorEmail,
                  slotStartIso: result.slotStart.toISOString(),
                },
              },
              referenceUid: `${result.publicUid}:email:booking-cancelled:host:${operationId}`,
            });
          }

          // Workflow EVENT_CANCELLED dispatch — user-configurable
          // rules layer on top of the hardcoded cancel emails above.
          await dispatchWorkflows({
            trigger: "EVENT_CANCELLED",
            booking: {
              bookingPublicUid: result.publicUid,
              hostId: ctx.user.id,
              hostName,
              hostEmail: hostUser?.email ?? null,
              hostHandle: hostUser?.handle ?? "",
              visitorName: result.visitorName,
              visitorEmail: result.visitorEmail,
              question: result.question ?? null,
              slotStartIso: result.slotStart.toISOString(),
              slotEndIso: result.slotEnd.toISOString(),
              operationId,
            },
          });

          emitBookingEvent({
            type: "cancelled",
            bookingPublicUid: result.publicUid,
            hostId: ctx.user.id,
            visitorName: result.visitorName,
            slotStart: result.slotStart.toISOString(),
            occurredAt: new Date().toISOString(),
          });

          return { ok: true as const, publicUid: result.publicUid };
        },
      ),
    ),

  // Visitor-driven reschedule. The publicUid is the capability —
  // anyone with the confirmation URL can reschedule their booking.
  // Same pattern as cal.com: in one transaction, soft-delete the old
  // row (audit RESCHEDULED_FROM, null idempotencyKey) and create a
  // new row pointing rescheduledFromUid → old.publicUid (audit
  // RESCHEDULED_TO). Both audit rows share the same operationId so
  // the chain is queryable in either direction.
  reschedule: publicProcedure
    .use(createRateLimitMiddleware("bookings.reschedule", 10, "1 m"))
    .input(
      z.object({
        oldPublicUid: z.string().min(1),
        newSlotStart: z.string().datetime(),
        idempotencyKey: z.string().uuid(),
        visitorTimezone: timezoneSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.reschedule",
          op: "booking.write",
          attributes: {
            oldPublicUid: input.oldPublicUid,
            idempotencyKey: input.idempotencyKey,
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async (span) => {
          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          // Idempotency short-circuit — if this idempotencyKey has
          // already produced a booking (the reschedule's NEW row),
          // return that row instead of redoing the swap.
          const existingByKey = await prisma.booking.findFirst({
            where: {
              idempotencyKey: input.idempotencyKey,
              deleted: false,
            },
            select: {
              id: true,
              publicUid: true,
              slotStart: true,
              slotEnd: true,
              hostId: true,
            },
          });
          if (existingByKey) {
            span.setAttribute("idempotencyHit", true);
            const host = await prisma.user.findUnique({
              where: { id: existingByKey.hostId },
              select: { handle: true },
            });
            return {
              publicUid: existingByKey.publicUid,
              handle: host?.handle ?? null,
            };
          }

          const original = await prisma.booking.findFirst({
            where: {
              publicUid: input.oldPublicUid,
              deleted: false,
            },
            select: {
              id: true,
              publicUid: true,
              hostId: true,
              visitorName: true,
              visitorEmail: true,
              question: true,
              slotStart: true,
              slotEnd: true,
              referrer: true,
              visitorTimezone: true,
            },
          });
          if (!original) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Booking not found or already cancelled",
            });
          }

          const host = await prisma.user.findUnique({
            where: { id: original.hostId },
            select: {
              id: true,
              name: true,
              handle: true,
              timezone: true,
              email: true,
            },
          });
          if (!host || !host.handle) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Host no longer exists",
            });
          }

          const newSlotStart = new Date(input.newSlotStart);
          if (Number.isNaN(newSlotStart.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid slot timestamp",
            });
          }
          if (newSlotStart.getTime() <= Date.now()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That slot is in the past",
            });
          }
          if (newSlotStart.getTime() === original.slotStart.getTime()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Pick a different slot to reschedule to",
            });
          }

          const ranges = await prisma.availabilityRange.findMany({
            where: { userId: host.id },
            select: { dayOfWeek: true, startTime: true, endTime: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          });
          const upcoming = generateUpcomingSlots({
            ranges,
            from: new Date(),
            days: 14,
            stepMinutes: SLOT_MINUTES,
            hostTimezone: host.timezone,
          });
          const isValid = upcoming.some(
            (s) => s.start === input.newSlotStart,
          );
          if (!isValid) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That slot isn't available anymore",
            });
          }

          const newSlotEnd = new Date(
            newSlotStart.getTime() + SLOT_MINUTES * 60_000,
          );

          try {
            const created = await prisma.$transaction(async (tx) => {
              // Re-check inside the tx — same race protection the
              // bookings.create handler runs.
              const existingInTx = await tx.booking.findFirst({
                where: {
                  idempotencyKey: input.idempotencyKey,
                  deleted: false,
                },
                select: {
                  id: true,
                  publicUid: true,
                  hostId: true,
                },
              });
              if (existingInTx) {
                span.setAttribute("idempotencyHitInTx", true);
                return existingInTx;
              }

              const slotCollision = await tx.booking.findFirst({
                where: {
                  hostId: host.id,
                  slotStart: newSlotStart,
                  deleted: false,
                },
                select: { id: true },
              });
              if (slotCollision) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message:
                    "Someone just grabbed that slot. Pick another.",
                });
              }

              // Cancel the original — soft delete + null idempotency.
              await tx.booking.update({
                where: { id: original.id },
                data: {
                  deleted: true,
                  deletedAt: new Date(),
                  idempotencyKey: null,
                },
              });

              await tx.bookingAudit.create({
                data: {
                  bookingUid: original.publicUid,
                  actor: "VISITOR",
                  action: "RESCHEDULED_FROM",
                  data: {
                    rescheduledToSlotStart: newSlotStart.toISOString(),
                    previousSlotStart: original.slotStart.toISOString(),
                    visitorEmail: original.visitorEmail,
                  },
                  operationId,
                },
              });

              const newBooking = await tx.booking.create({
                data: {
                  hostId: host.id,
                  visitorName: original.visitorName,
                  visitorEmail: original.visitorEmail,
                  question: original.question,
                  slotStart: newSlotStart,
                  slotEnd: newSlotEnd,
                  idempotencyKey: input.idempotencyKey,
                  referrer: original.referrer,
                  visitorTimezone:
                    input.visitorTimezone ?? original.visitorTimezone,
                  rescheduledFromUid: original.publicUid,
                },
                select: {
                  id: true,
                  publicUid: true,
                  hostId: true,
                  slotStart: true,
                  slotEnd: true,
                },
              });

              await tx.bookingAudit.create({
                data: {
                  bookingUid: newBooking.publicUid,
                  actor: "VISITOR",
                  action: "RESCHEDULED_TO",
                  data: {
                    rescheduledFromUid: original.publicUid,
                    previousSlotStart: original.slotStart.toISOString(),
                    newSlotStart: newSlotStart.toISOString(),
                    visitorEmail: original.visitorEmail,
                  },
                  operationId,
                },
              });

              return newBooking;
            });
            span.setAttribute("newBookingPublicUid", created.publicUid);

            // Webhook + email + bus fan-out (outside the tx, like
            // create + cancel). booking.rescheduled carries both
            // uids so receivers can stitch the chain.
            const subscriptions = await findActiveSubscriptionsForEvent(
              host.id,
              "booking.rescheduled",
            );
            for (const sub of subscriptions) {
              await scheduleWebhookDelivery({
                payload: {
                  webhookSubscriptionId: sub.id,
                  event: "booking.rescheduled",
                  body: {
                    event: "booking.rescheduled",
                    operationId,
                    booking: {
                      publicUid: created.publicUid,
                      slotStart: newSlotStart.toISOString(),
                      slotEnd: newSlotEnd.toISOString(),
                      visitorName: original.visitorName,
                      visitorEmail: original.visitorEmail,
                      rescheduledFromUid: original.publicUid,
                    },
                    previous: {
                      publicUid: original.publicUid,
                      slotStart: original.slotStart.toISOString(),
                    },
                    host: { handle: host.handle, id: host.id },
                    occurredAt: new Date().toISOString(),
                  },
                },
                referenceUid: `${created.publicUid}:booking.rescheduled:${sub.id}`,
              });
            }
            span.setAttribute("webhooksScheduled", subscriptions.length);

            const hostName =
              host.name ?? host.handle ?? "your host";
            const appUrl =
              env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
            const confirmationUrl = `${appUrl}/h/${host.handle}/booked/${created.publicUid}`;
            await scheduleEmailSend({
              payload: {
                to: original.visitorEmail,
                template: "booking-rescheduled",
                props: {
                  hostName,
                  visitorName: original.visitorName,
                  oldSlotStartIso: original.slotStart.toISOString(),
                  newSlotStartIso: newSlotStart.toISOString(),
                  confirmationUrl,
                },
              },
              referenceUid: `${created.publicUid}:email:booking-rescheduled:visitor:${operationId}`,
            });

            // Reminder swap — supersede the old booking's pending
            // reminder (referenceUid is keyed to the old publicUid)
            // and schedule a fresh one for the new slot, only if the
            // new slot is still >1h out.
            await cancelPendingTask({
              referenceUid: `${original.publicUid}:email:booking-reminder:visitor`,
              type: TASK_TYPE_EMAIL_SEND,
            });
            // Workflow tasks tied to the OLD booking's publicUid
            // also get superseded — a BEFORE_EVENT rule scheduled
            // before the swap shouldn't fire after. The new booking
            // re-runs EVENT_CREATED + BEFORE_EVENT dispatches below
            // so user rules carry over to the new slot.
            await cancelPendingWorkflowTasks(original.publicUid);
            const newReminderAt = new Date(
              newSlotStart.getTime() - REMINDER_LEAD_MS,
            );
            if (newReminderAt.getTime() > Date.now()) {
              await scheduleEmailSend({
                payload: {
                  to: original.visitorEmail,
                  template: "booking-reminder",
                  props: {
                    hostName,
                    visitorName: original.visitorName,
                    slotStartIso: newSlotStart.toISOString(),
                    confirmationUrl,
                  },
                },
                referenceUid: `${created.publicUid}:email:booking-reminder:visitor`,
                scheduledAt: newReminderAt,
              });
            }

            // Workflow EVENT_RESCHEDULED dispatch on the new booking.
            // We also re-run BEFORE_EVENT so any "ping me 24h before"
            // rule the host has set re-arms for the new slot.
            const reschedCtx: WorkflowBookingContext = {
              bookingPublicUid: created.publicUid,
              hostId: host.id,
              hostName,
              hostEmail: host.email,
              hostHandle: host.handle,
              visitorName: original.visitorName,
              visitorEmail: original.visitorEmail,
              question: original.question ?? null,
              slotStartIso: newSlotStart.toISOString(),
              slotEndIso: newSlotEnd.toISOString(),
              operationId,
            };
            await dispatchWorkflows({
              trigger: "EVENT_RESCHEDULED",
              booking: reschedCtx,
              oldSlotStartIso: original.slotStart.toISOString(),
            });
            await dispatchWorkflows({
              trigger: "BEFORE_EVENT",
              booking: reschedCtx,
            });

            // Both bus events fire so the host's live queue reflects
            // the swap immediately — old row "cancelled", new row
            // "created" with a rescheduledFromUid hint visible to
            // dashboard listeners.
            emitBookingEvent({
              type: "cancelled",
              bookingPublicUid: original.publicUid,
              hostId: host.id,
              visitorName: original.visitorName,
              slotStart: original.slotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });
            emitBookingEvent({
              type: "created",
              bookingPublicUid: created.publicUid,
              hostId: host.id,
              visitorName: original.visitorName,
              slotStart: newSlotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });

            return {
              publicUid: created.publicUid,
              handle: host.handle,
            };
          } catch (cause) {
            if (cause instanceof TRPCError) throw cause;
            if (
              cause instanceof Prisma.PrismaClientKnownRequestError &&
              cause.code === "P2002"
            ) {
              const raced = await prisma.booking.findFirst({
                where: {
                  idempotencyKey: input.idempotencyKey,
                  deleted: false,
                },
                select: { publicUid: true, hostId: true },
              });
              if (raced) {
                return {
                  publicUid: raced.publicUid,
                  handle: host.handle,
                };
              }
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not reschedule the booking. Try again.",
              cause,
            });
          }
        },
      ),
    ),

  // Host-side: every booking against this host, split by upcoming vs
  // past based on slotStart. No "pending/confirmed" yet — the data
  // model has no status field; per the project guide we don't add it
  // until a story actually demands the confirm flow.
  listForHost: privateProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await prisma.booking.findMany({
      where: { hostId: ctx.user.id, deleted: false },
      select: {
        id: true,
        publicUid: true,
        visitorName: true,
        visitorEmail: true,
        question: true,
        slotStart: true,
        slotEnd: true,
        createdAt: true,
      },
      orderBy: { slotStart: "asc" },
    });

    const upcoming = rows.filter((b) => b.slotStart >= now);
    const past = rows.filter((b) => b.slotStart < now).reverse();
    return { upcoming, past };
  }),

  // Live queue subscription — yields BookingBusEvent objects whenever
  // a booking is created or cancelled for this host. Pattern follows
  // tRPC v11's recommended SSE shape: privateProcedure + async
  // generator + AbortSignal-driven cleanup + `tracked()` for
  // reconnect recovery (Context7-verified against the v11
  // subscriptions docs).
  //
  // No `hostId` input — scoped to ctx.user.id from session. The bus
  // channel is `host:${ctx.user.id}` (see src/trpc/bus.ts).
  //
  // `lastEventId` is provided by the SSE protocol on reconnect. We
  // currently don't replay missed events from a persistent log —
  // that would require a per-host event store. For now reconnect
  // just resumes the live stream; clients should refetch
  // bookings.listForHost on reconnect to reconcile.
  queue: privateProcedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* ({ ctx, signal }) {
      // Server-side feature flag check — kill switch for the SSE
      // bus. If `live-queue` is off, we close the connection
      // immediately rather than holding it open forever. Belt-and-
      // suspenders: the client also gates via featureFlags before
      // calling useSubscription, but the server is the source of
      // truth in case a stale client tries to bypass.
      const enabled = await isFeatureEnabled("live-queue", ctx.user.id);
      if (!enabled) return;

      // signal! is non-null inside subscription procedures — tRPC v11
      // wires the request abort signal automatically.
      const iterable = iterateBookingEvents(ctx.user.id, signal!);
      for await (const [event] of iterable) {
        const e = event as BookingBusEvent;
        // tracked() ID format `${publicUid}:${type}` — unique per
        // event, deterministic, lets the SSE client recover lastEventId
        // semantics if we add a persistent log later.
        yield tracked(`${e.bookingPublicUid}:${e.type}`, e);
      }
    }),
});

// Webhook events the host can subscribe to. CSV-stored on the
// WebhookSubscription row; new events go in this list when their
// state-machine transitions ship.
const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
] as const;
type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const webhookCreateSchema = z.object({
  subscriberUrl: z.string().url("Must be a valid https URL"),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pick at least one event"),
});

const webhooks = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.webhookSubscription.findMany({
      where: { userId: ctx.user.id },
      // Never expose `secret` over the wire after creation. The host
      // got it once at create-time; if they lose it, they rotate by
      // deleting and re-creating.
      select: {
        publicUid: true,
        subscriberUrl: true,
        events: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: privateProcedure
    .input(webhookCreateSchema)
    .mutation(async ({ input, ctx }) => {
      // 32 random bytes, hex-encoded — 64 chars. Cryptographically
      // suitable for HMAC SHA-256. randomBytes is sync and Node-only
      // which is fine here (procedure runs server-side).
      const { randomBytes } = await import("node:crypto");
      const secret = randomBytes(32).toString("hex");

      const created = await prisma.webhookSubscription.create({
        data: {
          userId: ctx.user.id,
          subscriberUrl: input.subscriberUrl,
          events: input.events.join(","),
          secret,
        },
        select: {
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          secret: true, // returned EXACTLY ONCE on create
          createdAt: true,
        },
      });
      return created;
    }),

  delete: privateProcedure
    .input(z.object({ publicUid: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // deleteMany with the user-scope makes this safe even if a
      // visitor somehow guessed the publicUid — nothing happens.
      const result = await prisma.webhookSubscription.deleteMany({
        where: { publicUid: input.publicUid, userId: ctx.user.id },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }
      return { ok: true as const };
    }),
});

// Workspace sub-router (B1). Workspaces, memberships, and invitations
// are new primitives — booking / webhook / audit surfaces stay
// user-centric for now, but new collaboration features (co-hosts,
// workspace-scoped tokens, plan gating) can layer on this foundation.
//
// Pattern reference: cal Membership/Team + dub Project/ProjectUsers,
// scope matrix in src/lib/workspaces.ts (single source of truth).

const workspaceSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(WORKSPACE_SLUG_REGEX, {
    message: "Lowercase letters, digits, hyphens. 3–30 chars.",
  });

const workspaceMembershipRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

// Helper — fetches the caller's membership in a workspace (by slug)
// and asserts a scope. Throws NOT_FOUND when the workspace doesn't
// exist or the caller isn't a member, FORBIDDEN when the role
// doesn't grant the scope. NOT_FOUND on non-membership is deliberate
// (don't leak workspace existence to non-members).
async function requireMembership(
  workspaceSlug: string,
  userId: string,
  scope: WorkspaceScope,
) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      workspace: { slug: workspaceSlug },
    },
    select: {
      id: true,
      role: true,
      workspaceId: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!membership) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Workspace not found",
    });
  }
  if (!hasScope(membership.role, scope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Role ${membership.role} can't ${scope}`,
    });
  }
  return membership;
}

const workspaces = router({
  list: privateProcedure.query(async ({ ctx }) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: ctx.user.id },
      select: {
        role: true,
        assignedAt: true,
        workspace: {
          select: { id: true, slug: true, name: true, createdAt: true },
        },
      },
      orderBy: { assignedAt: "asc" },
    });
    return memberships.map((m) => ({
      role: m.role,
      assignedAt: m.assignedAt,
      ...m.workspace,
    }));
  }),

  create: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        name: z.string().trim().min(1).max(60),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const ws = await tx.workspace.create({
            data: {
              slug: input.slug,
              name: input.name,
              ownerId: ctx.user.id,
            },
            select: { id: true, slug: true, name: true },
          });
          await tx.membership.create({
            data: {
              workspaceId: ws.id,
              userId: ctx.user.id,
              role: "OWNER",
            },
          });
          return ws;
        });
        return created;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That slug is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create workspace.",
          cause,
        });
      }
    }),

  get: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "workspace.read",
      );
      return {
        id: membership.workspace.id,
        slug: membership.workspace.slug,
        name: membership.workspace.name,
        callerRole: membership.role,
        callerScopes: scopesFor(membership.role),
      };
    }),

  listMembers: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const membership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.read",
      );
      return prisma.membership.findMany({
        where: { workspaceId: membership.workspaceId },
        select: {
          id: true,
          role: true,
          assignedAt: true,
          user: {
            select: { id: true, handle: true, name: true, email: true },
          },
        },
        orderBy: { assignedAt: "asc" },
      });
    }),

  setMemberRole: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        userId: z.string().min(1),
        role: workspaceMembershipRoleSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      const target = await prisma.membership.findFirst({
        where: {
          workspaceId: callerMembership.workspaceId,
          userId: input.userId,
        },
        select: { id: true, role: true, userId: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User is not a member of this workspace",
        });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner role can't be reassigned here",
        });
      }
      if (
        input.role === "ADMIN" &&
        callerMembership.role !== "OWNER"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can grant ADMIN",
        });
      }
      await prisma.membership.update({
        where: { id: target.id },
        data: { role: input.role, assignedBy: ctx.user.id },
      });
      return { ok: true as const };
    }),

  removeMember: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        input.userId === ctx.user.id ? "workspace.read" : "members.write",
      );
      const target = await prisma.membership.findFirst({
        where: {
          workspaceId: callerMembership.workspaceId,
          userId: input.userId,
        },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User is not a member of this workspace",
        });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner can't be removed",
        });
      }
      await prisma.membership.delete({ where: { id: target.id } });
      return { ok: true as const };
    }),

  invite: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        email: z.string().trim().email().toLowerCase(),
        role: workspaceMembershipRoleSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      if (input.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Owner can't be granted via invite",
        });
      }
      if (input.role === "ADMIN" && callerMembership.role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can invite ADMINs",
        });
      }

      const token = await generateInvitationToken();
      const invitation = await prisma.invitation.create({
        data: {
          workspaceId: callerMembership.workspaceId,
          email: input.email,
          role: input.role,
          token,
          invitedBy: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });

      const inviter = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true, handle: true },
      });
      const inviterName =
        inviter?.name ?? inviter?.handle ?? "An Officehours user";
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const acceptUrl = `${appUrl}/invitations/${token}`;
      await scheduleEmailSend({
        payload: {
          to: input.email,
          template: "workspace-invite",
          props: {
            workspaceName: callerMembership.workspace.name,
            inviterName,
            role: input.role,
            acceptUrl,
          },
        },
        referenceUid: `invitation:${invitation.id}:email`,
      });

      return invitation;
    }),

  listInvitations: privateProcedure
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.read",
      );
      return prisma.invitation.findMany({
        where: { workspaceId: callerMembership.workspaceId },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  revokeInvitation: privateProcedure
    .input(
      z.object({
        slug: workspaceSlugSchema,
        invitationId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const callerMembership = await requireMembership(
        input.slug,
        ctx.user.id,
        "members.write",
      );
      const result = await prisma.invitation.deleteMany({
        where: {
          id: input.invitationId,
          workspaceId: callerMembership.workspaceId,
          acceptedAt: null,
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found or already accepted",
        });
      }
      return { ok: true as const };
    }),

  // API key CRUD (B2). Tokens are workspace-scoped. The full token
  // returns EXACTLY ONCE at create time; subsequent reads only see
  // the prefix. Minting requires workspace.write — admin-level
  // action even when the resulting key carries narrower scopes.
  apiKeys: router({
    list: privateProcedure
      .input(z.object({ slug: workspaceSlugSchema }))
      .query(async ({ input, ctx }) => {
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "workspace.read",
        );
        return prisma.apiKey.findMany({
          where: { workspaceId: membership.workspaceId },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }),

    create: privateProcedure
      .input(
        z.object({
          slug: workspaceSlugSchema,
          name: z.string().trim().min(1).max(60),
          scopes: z
            .array(z.enum(WORKSPACE_SCOPES))
            .min(1, "At least one scope")
            .max(WORKSPACE_SCOPES.length),
          expiresAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        // Procedure-level gate: members.write (OWNER + ADMIN). The
        // per-scope subset check below is the real guardrail —
        // admins can mint tokens, but only with scopes they hold.
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "members.write",
        );

        // Token can carry at most the scopes the creator's role
        // grants. ADMIN can't mint a key with workspace.write
        // (OWNER-only) even if they pass it in.
        const callerScopes = new Set(scopesFor(membership.role));
        for (const s of input.scopes) {
          if (!callerScopes.has(s)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Token scope ${s} exceeds creator role`,
            });
          }
        }

        const key = generateApiKey();
        const created = await prisma.apiKey.create({
          data: {
            workspaceId: membership.workspaceId,
            name: input.name,
            prefix: key.prefix,
            tokenHash: key.hash,
            scopes: input.scopes.join(","),
            createdById: ctx.user.id,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            createdAt: true,
            expiresAt: true,
          },
        });

        // Token returned exactly once. Subsequent reads via .list
        // surface only `prefix` — losing the value forces a rotate.
        return { ...created, token: key.token };
      }),

    revoke: privateProcedure
      .input(
        z.object({
          slug: workspaceSlugSchema,
          keyId: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "workspace.write",
        );
        const result = await prisma.apiKey.updateMany({
          where: {
            id: input.keyId,
            workspaceId: membership.workspaceId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        if (result.count === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API key not found or already revoked",
          });
        }
        return { ok: true as const };
      }),
  }),
});

const invitations = router({
  preview: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
        select: {
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          workspace: {
            select: { slug: true, name: true },
          },
        },
      });
      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }
      const expired = inv.expiresAt.getTime() < Date.now();
      return { ...inv, expired };
    }),

  accept: privateProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const inv = await prisma.invitation.findUnique({
        where: { token: input.token },
        select: {
          id: true,
          workspaceId: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          email: true,
        },
      });
      if (!inv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }
      if (inv.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation already accepted",
        });
      }
      if (inv.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation expired",
        });
      }

      try {
        await prisma.$transaction([
          prisma.membership.create({
            data: {
              workspaceId: inv.workspaceId,
              userId: ctx.user.id,
              role: inv.role,
              assignedBy: null,
            },
          }),
          prisma.invitation.update({
            where: { id: inv.id },
            data: { acceptedAt: new Date() },
          }),
        ]);
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You're already a member of this workspace",
            cause,
          });
        }
        throw cause;
      }
      return { ok: true as const, workspaceId: inv.workspaceId };
    }),
});

// Admin sub-router (A9). Read-mostly operator surface with three
// concerns: feature-flag toggling + assignment, webhook subscription
// inspection + retry, and audit-trail replay by booking uid. All
// procedures gate behind adminProcedure (env-list handle check).
const admin = router({
  featureFlags: router({
    // List every known flag (from FEATURE_DEFAULTS) with the DB row
    // shape (or defaults if no row), assignment count, and a sample
    // of assigned handles. Defaults flow through so a newly-defined
    // flag shows up before its first DB write.
    list: adminProcedure.query(async () => {
      const known = Object.keys(FEATURE_DEFAULTS) as Array<
        keyof typeof FEATURE_DEFAULTS
      >;
      const rows = await prisma.feature.findMany({
        where: { slug: { in: known } },
        select: {
          slug: true,
          enabled: true,
          type: true,
          description: true,
          assignments: {
            select: {
              user: { select: { handle: true } },
              assignedAt: true,
            },
          },
        },
      });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return known.map((slug) => {
        const row = bySlug.get(slug);
        return {
          slug,
          enabled: row?.enabled ?? FEATURE_DEFAULTS[slug],
          hasRow: Boolean(row),
          type: row?.type ?? "RELEASE",
          description: row?.description ?? null,
          assignments:
            row?.assignments.map((a) => ({
              handle: a.user.handle,
              assignedAt: a.assignedAt,
            })) ?? [],
        };
      });
    }),

    // Upsert the row's `enabled` flag. Creates the row if missing
    // (so admins don't have to seed a default before flipping a
    // kill-switch on a code-defaulted flag).
    setEnabled: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ input }) => {
        await prisma.feature.upsert({
          where: { slug: input.slug },
          create: { slug: input.slug, enabled: input.enabled },
          update: { enabled: input.enabled },
        });
        return { ok: true as const };
      }),

    assign: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          handle: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const target = await prisma.user.findUnique({
          where: { handle: input.handle },
          select: { id: true },
        });
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No user with that handle",
          });
        }
        // Ensure the Feature row exists — assignment depends on it.
        await prisma.feature.upsert({
          where: { slug: input.slug },
          create: { slug: input.slug, enabled: true },
          update: {},
        });
        await prisma.userFeatures.upsert({
          where: {
            userId_featureSlug: {
              userId: target.id,
              featureSlug: input.slug,
            },
          },
          create: {
            userId: target.id,
            featureSlug: input.slug,
            assignedBy: ctx.user.id,
          },
          update: {},
        });
        return { ok: true as const };
      }),

    unassign: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          handle: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const target = await prisma.user.findUnique({
          where: { handle: input.handle },
          select: { id: true },
        });
        if (!target) return { ok: true as const, deleted: 0 };
        const result = await prisma.userFeatures.deleteMany({
          where: {
            userId: target.id,
            featureSlug: input.slug,
          },
        });
        return { ok: true as const, deleted: result.count };
      }),
  }),

  webhooks: router({
    // Every WebhookSubscription across users + a count of failed
    // deliveries (Task rows with attempts >= maxAttempts AND
    // succeededAt IS NULL — the permanently-failed predicate from
    // process-tasks/route.ts).
    listAll: adminProcedure.query(async () => {
      const subs = await prisma.webhookSubscription.findMany({
        select: {
          id: true,
          publicUid: true,
          subscriberUrl: true,
          events: true,
          active: true,
          createdAt: true,
          user: { select: { handle: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return subs;
    }),

    // Failed Task rows with type=webhookDelivery — useful for
    // retrying after a receiver outage. The retry mutation below
    // resets attempts + scheduledAt so the next cron tick picks it up.
    failedDeliveries: adminProcedure.query(async () => {
      const rows = await prisma.task.findMany({
        where: {
          type: "webhookDelivery",
          succeededAt: null,
        },
        select: {
          id: true,
          referenceUid: true,
          attempts: true,
          maxAttempts: true,
          scheduledAt: true,
          lastError: true,
          lastFailedAttemptAt: true,
        },
        orderBy: { lastFailedAttemptAt: "desc" },
        take: 100,
      });
      return rows.filter((r) => r.attempts >= r.maxAttempts);
    }),

    retry: adminProcedure
      .input(z.object({ taskId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const updated = await prisma.task.update({
          where: { id: input.taskId },
          data: {
            attempts: 0,
            scheduledAt: new Date(),
            lastError: null,
            lastFailedAttemptAt: null,
          },
          select: { id: true, scheduledAt: true },
        });
        return { ok: true as const, taskId: updated.id };
      }),
  }),

  audit: router({
    // Every BookingAudit row for one bookingUid in chronological
    // order. Survives booking deletion (no FK), so this is the
    // forensic answer for "what happened to that booking?"
    byBookingUid: adminProcedure
      .input(z.object({ bookingUid: z.string().min(1) }))
      .query(async ({ input }) => {
        return prisma.bookingAudit.findMany({
          where: { bookingUid: input.bookingUid },
          select: {
            id: true,
            actor: true,
            action: true,
            data: true,
            operationId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        });
      }),
  }),
});

// Calendar sub-router (B3). Read-side OAuth flow: connect → list
// calendars → select. Busy times are merged into the public slot
// query (see schedule.getUpcomingSlots above) — there's no separate
// "fetch busy times" procedure on the surface; that pull happens on
// the slot query path.
const calendar = router({
  // List the host's connected providers + selected-calendar counts.
  // Procedures that touch a specific connection take its `id`.
  connections: privateProcedure.query(async ({ ctx }) => {
    return prisma.calendarCredential.findMany({
      where: { userId: ctx.user.id },
      select: {
        id: true,
        provider: true,
        externalAccountEmail: true,
        createdAt: true,
        _count: { select: { selectedCalendars: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  // Returns the OAuth consent URL for a provider (or null when the
  // provider isn't configured). The caller redirects the browser
  // there; the callback route at /api/auth/calendar/<provider>/
  // callback exchanges the code + persists a CalendarCredential.
  authUrl: privateProcedure
    .input(
      z.object({
        provider: z.enum(["GOOGLE", "MICROSOFT"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      // The state binds the OAuth redirect to the calling user — we
      // verify on callback so a stranger can't drop a refresh_token
      // onto someone else's account by intercepting the redirect.
      // 32 random bytes give us 256 bits of entropy.
      const { randomBytes } = await import("node:crypto");
      const state = `${ctx.user.id}:${randomBytes(32).toString("hex")}`;
      const redirectUri =
        input.provider === "GOOGLE"
          ? `${appUrl}/api/auth/calendar/google/callback`
          : `${appUrl}/api/auth/calendar/microsoft/callback`;
      const url =
        input.provider === "GOOGLE"
          ? googleAuthUrl({ redirectUri, state })
          : microsoftAuthUrl({ redirectUri, state });
      if (!url) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${input.provider} OAuth is not configured. Set the corresponding env vars.`,
        });
      }
      return { url, state };
    }),

  disconnect: privateProcedure
    .input(z.object({ credentialId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // deleteMany scoped to the caller — a stranger can't delete
      // a credential by guessing its id.
      const result = await prisma.calendarCredential.deleteMany({
        where: { id: input.credentialId, userId: ctx.user.id },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      return { ok: true as const };
    }),

  // List calendars on a connected account. Hits the provider's API
  // through the adapter. Errors bubble — the UI shows them inline.
  listCalendars: privateProcedure
    .input(z.object({ credentialId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const credential = await prisma.calendarCredential.findFirst({
        where: { id: input.credentialId, userId: ctx.user.id },
        select: { id: true, provider: true },
      });
      if (!credential) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      const adapter = getCalendarAdapter(credential.id, credential.provider);
      if (!adapter) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${credential.provider} OAuth is not configured`,
        });
      }
      const calendars = await adapter.listCalendars();
      const selected = await prisma.selectedCalendar.findMany({
        where: { credentialId: credential.id },
        select: { externalCalendarId: true },
      });
      const selectedSet = new Set(
        selected.map((s) => s.externalCalendarId),
      );
      return calendars.map((c) => ({
        ...c,
        selected: selectedSet.has(c.externalCalendarId),
      }));
    }),

  // Replace the selection set for a credential. The full set is
  // passed; rows not in the new set get deleted, rows in the new
  // set that don't exist get inserted. Idempotent.
  setSelected: privateProcedure
    .input(
      z.object({
        credentialId: z.string().min(1),
        calendars: z.array(
          z.object({
            externalCalendarId: z.string().min(1),
            summary: z.string().min(1).max(200),
            isPrimary: z.boolean().default(false),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const credential = await prisma.calendarCredential.findFirst({
        where: { id: input.credentialId, userId: ctx.user.id },
        select: { id: true },
      });
      if (!credential) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Credential not found",
        });
      }
      const targetIds = new Set(
        input.calendars.map((c) => c.externalCalendarId),
      );
      await prisma.$transaction([
        prisma.selectedCalendar.deleteMany({
          where: {
            credentialId: credential.id,
            externalCalendarId: { notIn: Array.from(targetIds) },
          },
        }),
        ...input.calendars.map((c) =>
          prisma.selectedCalendar.upsert({
            where: {
              credentialId_externalCalendarId: {
                credentialId: credential.id,
                externalCalendarId: c.externalCalendarId,
              },
            },
            create: {
              credentialId: credential.id,
              externalCalendarId: c.externalCalendarId,
              summary: c.summary,
              isPrimary: c.isPrimary,
            },
            update: {
              summary: c.summary,
              isPrimary: c.isPrimary,
            },
          }),
        ),
      ]);
      return { ok: true as const, count: input.calendars.length };
    }),
});

// Workflow sub-router (B4). User-configurable automation rules
// (trigger × action × offset). Procedures are user-scoped — a host
// can only see + edit their own rules. The engine in
// src/lib/workflows.ts consumes these rows on every booking event.
const workflowTriggerSchema = z.enum([
  "BEFORE_EVENT",
  "EVENT_CREATED",
  "EVENT_CANCELLED",
  "EVENT_RESCHEDULED",
]);
const workflowActionSchema = z.enum([
  "EMAIL_VISITOR",
  "EMAIL_HOST",
  "WEBHOOK_FIRE",
]);

const workflows = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.workflow.findMany({
      where: { userId: ctx.user.id },
      select: {
        id: true,
        name: true,
        trigger: true,
        offsetMinutes: true,
        action: true,
        template: true,
        webhookEvent: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: privateProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        trigger: workflowTriggerSchema,
        // 0 minutes = "fire at slotStart exactly" (BEFORE_EVENT) or
        // ignored (other triggers). Capped at 1 week so a typo
        // doesn't enqueue a Task that sits in the queue for years.
        offsetMinutes: z.number().int().min(0).max(7 * 24 * 60),
        action: workflowActionSchema,
        template: z.string().min(1).max(60).optional(),
        webhookEvent: z.string().min(1).max(60).optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Cross-field validation: EMAIL_* needs a template; WEBHOOK_FIRE
      // needs a webhookEvent. Caught here so the engine doesn't have
      // to defend against malformed rows on every dispatch.
      if (
        (input.action === "EMAIL_VISITOR" || input.action === "EMAIL_HOST") &&
        !input.template
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "EMAIL_* actions require a template name",
        });
      }
      if (input.action === "WEBHOOK_FIRE" && !input.webhookEvent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "WEBHOOK_FIRE actions require a webhookEvent",
        });
      }

      return prisma.workflow.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          trigger: input.trigger,
          offsetMinutes:
            input.trigger === "BEFORE_EVENT" ? input.offsetMinutes : 0,
          action: input.action,
          template: input.template ?? null,
          webhookEvent: input.webhookEvent ?? null,
          active: input.active,
        },
        select: {
          id: true,
          name: true,
          trigger: true,
          offsetMinutes: true,
          action: true,
          template: true,
          webhookEvent: true,
          active: true,
        },
      });
    }),

  update: privateProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        offsetMinutes: z
          .number()
          .int()
          .min(0)
          .max(7 * 24 * 60)
          .optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.workflow.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.offsetMinutes !== undefined
            ? { offsetMinutes: input.offsetMinutes }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      return { ok: true as const };
    }),

  delete: privateProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await prisma.workflow.deleteMany({
        where: { id: input.id, userId: ctx.user.id },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      return { ok: true as const };
    }),
});

export const appRouter = router({
  schedule,
  auth,
  users,
  bookings,
  webhooks,
  workspaces,
  invitations,
  admin,
  calendar,
  workflows,
});
export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export type AppRouter = typeof appRouter;
