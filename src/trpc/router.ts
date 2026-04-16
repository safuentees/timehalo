import { prisma } from "@/lib/prisma";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.create();

const publicProcedure = t.procedure;

const router = t.router;

const middleware = t.middleware;

const posts = router({
  list: publicProcedure.query(async () => {
    return await prisma.post.findMany();
  }),

  push: publicProcedure
    .input(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        date: z.string(),
        readTime: z.string(),
        tag: z.string(),
      }),
    )
    .mutation(({ input }) => {
      prisma.post.create({ data: input });
      return input;
    }),
  onNewPost: publicProcedure.subscription(async function* () {
    // This keeps running, yielding whenever there's a new post
    while (true) {
      const newPost = await waitForNewPost(); // your logic
      yield newPost; // pushed to the client
    }
  }),
});

export const appRouter = router({ posts });

export type AppRouter = typeof appRouter;
