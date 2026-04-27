import { initTRPC, TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { createRatelimit, type Duration } from "@/lib/rate-limit";
import type { Context } from "@/trpc/context";

const t = initTRPC.context<Context>().create({
  sse: {
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

export const createCaller = t.createCallerFactory;

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

export const privateProcedure = publicProcedure.use(isAuthed);

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

export const adminProcedure = publicProcedure.use(isAdmin);

export function createRateLimitMiddleware(
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
