import { prisma } from "@/lib/prisma";
import { DayOfWeek } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";
import { generateUpcomingSlots } from "@/lib/schedule";
import { bookingInputSchema } from "@/lib/booking-schema";
import { createRatelimit, type Duration } from "@/lib/rate-limit";
import { withSpan } from "@/lib/observability";
import {
  findActiveSubscriptionsForEvent,
  scheduleWebhookDelivery,
} from "@/lib/tasks";

// Same rule as the client-side handleFieldSchema — kept inline here to
// avoid importing client code into the server bundle.
const handleSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

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

const t = initTRPC.context<Context>().create();

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
        select: { id: true },
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
      });

      if (slots.length === 0) {
        return [];
      }

      const bookings = await prisma.booking.findMany({
        where: {
          hostId: user.id,
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

const users = router({
  // Minimal "me" projection — just the fields the settings form needs.
  // Returning the whole User record would leak passwordHash, attempts, etc.
  me: privateProcedure.query(async ({ ctx }) => {
    return await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { id: true, handle: true },
    });
  }),

  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true, name: true, handle: true, image: true }, // no email/hash
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
      const existingByKey = await prisma.booking.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: bookingSelect,
      });
      if (existingByKey) {
        span.setAttribute("idempotencyHit", true);
        return existingByKey;
      }

      const host = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true },
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

      try {
        // $transaction(async tx => ...) — booking write and audit row
        // commit atomically. If the audit insert fails, the booking
        // rolls back, so we can never have an unaudited booking.
        const booking = await prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              hostId: host.id,
              visitorName: input.visitorName,
              visitorEmail: input.visitorEmail,
              question: input.question,
              slotStart,
              slotEnd,
              idempotencyKey: input.idempotencyKey,
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

        return booking;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          // Race protection: between the findUnique above and this
          // create, a parallel request with the same idempotencyKey
          // could have landed first. Look it up and return it instead
          // of throwing CONFLICT. P2002.meta.target is the offending
          // index — Prisma normalizes this to a string array; the
          // shape varies by adapter, so accept either string or array
          // and substring-match for the field name.
          const target = cause.meta?.target;
          const targetStr = Array.isArray(target)
            ? target.join(",")
            : typeof target === "string"
              ? target
              : "";
          if (targetStr.includes("idempotencyKey")) {
            const raced = await prisma.booking.findUnique({
              where: { idempotencyKey: input.idempotencyKey },
              select: bookingSelect,
            });
            if (raced) return raced;
            // Extreme edge: constraint hit but row not found. Fall
            // through to a generic error so we don't return undefined.
          }

          throw new TRPCError({
            code: "CONFLICT",
            message: "Someone just grabbed that slot. Pick another.",
            cause,
          });
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

  // Host-side: every booking against this host, split by upcoming vs
  // past based on slotStart. No "pending/confirmed" yet — the data
  // model has no status field; per the project guide we don't add it
  // until a story actually demands the confirm flow.
  listForHost: privateProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await prisma.booking.findMany({
      where: { hostId: ctx.user.id },
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
});

// Webhook events the host can subscribe to. CSV-stored on the
// WebhookSubscription row; new events go in this list when their
// state-machine transitions ship (booking.confirmed / cancelled in
// future commits).
const WEBHOOK_EVENTS = ["booking.created"] as const;
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

export const appRouter = router({ schedule, users, bookings, webhooks });
export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export type AppRouter = typeof appRouter;
