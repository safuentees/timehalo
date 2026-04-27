import { initTRPC, TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { createRatelimit, type Duration } from "@/lib/rate-limit";
import type { Context } from "@/trpc/context";

// Single tRPC instance for the whole app. Ports of the v11 SSE config
// were verified against the v11 subscriptions docs (Context7):
// `ping` keeps proxies/load-balancers from killing idle connections
// after their default timeout (often 30s).
// `reconnectAfterInactivityMs` is a client-side hint — the
// subscriber auto-reconnects if no event or ping arrives in the
// window. Both numbers are deliberate: ping must be < the smallest
// proxy idle timeout you might be behind, reconnect must be > ping
// interval so a single missed ping doesn't trigger a reconnect.
const t = initTRPC.context<Context>().create({
  sse: {
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

// Exposed for tests + future server-action wrappers. tRPC v11's
// createCallerFactory needs to be called from the same `t` instance
// the router was built with so the Context type matches; exporting
// it here keeps the type chain intact for any caller.
export const createCaller = t.createCallerFactory;

const isAuthed = middleware(async (opts) => {
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

export const privateProcedure = publicProcedure.use(isAuthed);

// Admin gate — looks up the logged-in user's handle and checks it
// against OFFICEHOURS_ADMIN_HANDLES (CSV env). Cheap because users.me
// already runs on every authed request and the lookup is keyed on
// the indexed unique `id`. Rejects with FORBIDDEN, not UNAUTHORIZED —
// the user IS logged in, they just don't have the role.
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

// Rate-limit middleware factory — port of rallly's
// createRateLimitMiddleware (apps/web/src/trpc/trpc.ts:134-174). The
// limiter instance is created ONCE per `name` at module load; the
// returned middleware is stateless and just calls .limit().
//
// Bucketing key shape: `${name}:${ctx.ipIdentifier}`. Including the
// procedure name keeps namespaces clean — `bookings.create` doesn't
// share a bucket with a future `slots.hold`.
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
