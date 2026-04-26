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

const handleSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

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

      const operationId = crypto.randomUUID();
      span.setAttribute("operationId", operationId);

      try {
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
        return booking;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
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

export const appRouter = router({ schedule, users, bookings });

export type AppRouter = typeof appRouter;
