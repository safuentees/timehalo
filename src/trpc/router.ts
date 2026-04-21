import { prisma } from "@/lib/prisma";
import { DayOfWeek } from "@/generated/prisma/enums";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";

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
  .refine((r) => r.from < r.to, { message: "End must be after start", path: ["to"] });
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

      await prisma.$transaction([
        prisma.availabilityRange.deleteMany({ where: { userId: ctx.user.id } }),
        prisma.availabilityRange.createMany({ data: rows }),
      ]);

      return { count: rows.length };
    }),
});

export const appRouter = router({ posts, schedule });

export type AppRouter = typeof appRouter;
