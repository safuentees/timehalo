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
  findActiveSubscriptionsForEvent,
  scheduleEmailSend,
  scheduleWebhookDelivery,
} from "@/lib/tasks";
import {
  emitBookingEvent,
  iterateBookingEvents,
  type BookingBusEvent,
} from "@/trpc/bus";
import {
  getEnabledFeatures,
  isFeatureEnabled,
} from "@/lib/feature-flags";
import { timezoneSchema } from "@/lib/timezone";

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

      const slots = generateUpcomingSlots({
        ranges,
        from: new Date(),
        days: input.days,
        stepMinutes: 15,
        hostTimezone: user.timezone,
      });

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
        select: { id: true, name: true, handle: true, timezone: true },
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

export const appRouter = router({ schedule, auth, users, bookings, webhooks });
export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export type AppRouter = typeof appRouter;
