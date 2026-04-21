import { prisma } from "@/lib/prisma";
import {
  defaultSchedule,
  formValuesToRows,
  rowsToFormValues,
  scheduleSchema,
} from "@/lib/schedule";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";

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
    const rows = await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      select: { dayOfWeek: true, startTime: true, endTime: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    if (rows.length === 0) return defaultSchedule;
    return rowsToFormValues(rows);
  }),

  save: privateProcedure
    .input(scheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const rows = formValuesToRows(input).map((r) => ({
        ...r,
        userId: ctx.user.id,
      }));

      await prisma.$transaction([
        prisma.availabilityRange.deleteMany({ where: { userId: ctx.user.id } }),
        prisma.availabilityRange.createMany({ data: rows }),
      ]);

      return { count: rows.length };
    }),
});

export const appRouter = router({ posts, schedule });

export type AppRouter = typeof appRouter;
