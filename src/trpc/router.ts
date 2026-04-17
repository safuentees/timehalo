import { prisma } from "@/lib/prisma";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "@/trpc/context";

const t = initTRPC.context<Context>().create();

const middleware = t.middleware;

const publicProcedure = t.procedure;

const isAuthed = middleware(async (opts) => {
  // opts.ctx — the current context (user, session, etc.)
  // opts.next() — continue to the next middleware or the procedure

  if (!opts.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      user: opts.ctx.user, // now guaranteed non-null for the procedure
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
    .mutation(async ({ input }) => {
      await prisma.post.create({ data: input });
      return input;
    }),
  onNewPost: publicProcedure.subscription(async function* () {
    // This keeps running, yielding whenever there's a new post
    // while (true) {
    //   // const newPost = await waitForNewPost(); // your logic
    //   // yield newPost; // pushed to the client
    // }
  }),
});

export const appRouter = router({ posts });

export type AppRouter = typeof appRouter;
