import { prisma } from "@/lib/prisma";
import { DayOfWeek } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";
import { generateUpcomingSlots } from "@/lib/schedule";
import { bookingInputSchema } from "@/lib/booking-schema";

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

const router = t.router;

const posts = router({
  list: publicProcedure.query(async () => {
    return await prisma.post.findMany({
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
  }),

  push: privateProcedure
    .input(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        date: z.string(),
        readTime: z.string(),
        tag: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await prisma.post.create({
        data: { ...input, userId: ctx.user.id },
      });
      return input;
    }),
  onNewPost: publicProcedure.subscription(async function* () {
  }),
  del: privateProcedure
    .input(z.object({ id: z.int() }))
    .mutation(async ({ input, ctx }) => {
      const post = await prisma.post.findUnique({
        where: { id: input.id, userId: ctx.user.id },
      });
      if (!post) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Post not found or you don't have permission to delete it",
        });
      }
      await prisma.post.delete({ where: { id: input.id } });
      return { id: input.id };
    }),
});

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

      return generateUpcomingSlots({
        ranges,
        from: new Date(),
        days: input.days,
        stepMinutes: 15,
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

const bookings = router({
  create: publicProcedure
    .input(bookingInputSchema)
    .mutation(async ({ input }) => {
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

      try {
        const booking = await prisma.booking.create({
          data: {
            hostId: host.id,
            visitorName: input.visitorName,
            visitorEmail: input.visitorEmail,
            question: input.question,
            slotStart,
            slotEnd,
          },
          select: {
            id: true,
            slotStart: true,
            slotEnd: true,
          },
        });
        return booking;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
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
    }),
});

export const appRouter = router({ posts, schedule, users, bookings });

export type AppRouter = typeof appRouter;
