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
    // This keeps running, yielding whenever there's a new post
    // while (true) {
    //   // const newPost = await waitForNewPost(); // your logic
    //   // yield newPost; // pushed to the client
    // }
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
  // Returns the weekly schedule already shaped for the form.
  // If the user has no rows, returns the app's defaultSchedule so the form
  // renders with Mon–Fri 9–17 + weekends off (Path A: backend fills defaults
  // on empty, no signup-time seeding).
  get: privateProcedure.query(async ({ ctx }) => {
    const rows = await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      select: { dayOfWeek: true, startTime: true, endTime: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    if (rows.length === 0) return defaultSchedule;
    return rowsToFormValues(rows);
  }),

  // Replaces the user's whole schedule in one transaction:
  // delete all existing rows, insert the new set built from the form payload.
  // Days with enabled=false or empty ranges produce zero rows (implicitly off).
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
