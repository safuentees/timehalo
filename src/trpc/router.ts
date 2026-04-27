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
  sse: {
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

const middleware = t.middleware;

const publicProcedure = t.procedure;

const isAuthed = middleware(async (opts) => {

  if (!opts.ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      user: { ...opts.ctx.user, id: opts.ctx.user.id },
    },
  });
});

const privateProcedure = publicProcedure.use(isAuthed);

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

export const createCaller = t.createCallerFactory;

const schedule = router({
  get: privateProcedure.query(async ({ ctx }) => {
    return await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }),

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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your schedule. Try again.",
          cause,
        });
      }

      return { count: rows.length };
    }),

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
  me: privateProcedure.query(async ({ ctx }) => {
    return await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
      },
    });
  }),

  featureFlags: privateProcedure.query(async ({ ctx }) => {
    return getEnabledFeatures(ctx.user.id);
  }),

  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
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

  setTimezone: privateProcedure
    .input(z.object({ timezone: timezoneSchema }))
    .mutation(async ({ input, ctx }) => {
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),

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
      referenceUid: `user:${ctx.user.id}:account-deleted:${operationId}`,
    });

    await prisma.user.delete({ where: { id: ctx.user.id } });

    return { ok: true as const };
  }),
});

const SLOT_MINUTES = 15;
const REMINDER_LEAD_MS = 60 * 60 * 1000;
const bookingConfirmationInputSchema = z.object({
  handle: z.string().min(1),
  bookingUid: z.string().min(1),
});

const bookings = router({
  create: publicProcedure
    .use(createRateLimitMiddleware("bookings.create", 10, "1 m"))
    .input(bookingInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.create",
          op: "booking.write",
          attributes: {
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

      const operationId = crypto.randomUUID();
      span.setAttribute("operationId", operationId);

      const referrer = ctx.cookies.get(`oh_ref_${input.handle}`) ?? null;
      if (referrer) span.setAttribute("referrer", referrer);

      try {
        const booking = await prisma.$transaction(async (tx) => {
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
        if (cause instanceof TRPCError) throw cause;

        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
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
                  previousIdempotencyKey: target.idempotencyKey,
                },
                operationId,
              },
            });

            return target;
          });

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

          await cancelPendingTask({
            referenceUid: `${result.publicUid}:email:booking-reminder:visitor`,
            type: TASK_TYPE_EMAIL_SEND,
          });

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

            await cancelPendingTask({
              referenceUid: `${original.publicUid}:email:booking-reminder:visitor`,
              type: TASK_TYPE_EMAIL_SEND,
            });
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

  queue: privateProcedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* ({ ctx, signal }) {
      const enabled = await isFeatureEnabled("live-queue", ctx.user.id);
      if (!enabled) return;

      const iterable = iterateBookingEvents(ctx.user.id, signal!);
      for await (const [event] of iterable) {
        const e = event as BookingBusEvent;
        yield tracked(`${e.bookingPublicUid}:${e.type}`, e);
      }
    }),
});

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
        const membership = await requireMembership(
          input.slug,
          ctx.user.id,
          "members.write",
        );

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

const admin = router({
  featureFlags: router({
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

export const appRouter = router({
  schedule,
  auth,
  users,
  bookings,
  webhooks,
  workspaces,
  invitations,
  admin,
});
export { WEBHOOK_EVENTS };
export type { WebhookEvent };

export type AppRouter = typeof appRouter;
