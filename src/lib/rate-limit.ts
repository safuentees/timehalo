import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Two-mode rate limiter: in-memory fallback + Upstash Redis swap.
//
// The memory path is rallly's pattern (apps/web/src/lib/rate-limit/
// index.ts:29-81) — fixed-window with `setTimeout(...).unref?.()` so
// the dev server's event loop doesn't stay alive forever after `pnpm
// dev` exits. Per-instance only — multi-region serverless can't
// share state across cold-started processes, so this mode is NOT a
// real rate limit when more than one Lambda is running.
//
// The Redis path uses `@upstash/ratelimit` + `@upstash/redis` REST
// client (HTTP, no TCP — works on Vercel Edge / Lambda / Cloudflare).
// `Ratelimit.fixedWindow` runs atomically via Lua so concurrent
// invocations across instances see consistent budgets. Activated when
// both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
//
// Both paths return the same `LimiterResult` shape so callers don't
// branch on transport.

export type Unit = "ms" | "s" | "m" | "h" | "d";
export type Duration = `${number} ${Unit}` | `${number}${Unit}`;

const unitToMs: Record<Unit, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function parseDurationMs(duration: Duration): number {
  const match = duration.match(/^(\d+)\s?(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }
  return Number(match[1]) * unitToMs[match[2] as Unit];
}

type LimiterResult = {
  success: boolean;
  remainingPoints: number;
  // Unix ms timestamp at which the current window resets (and the
  // budget is restored). Callers building HTTP 429 responses turn
  // this into a `Retry-After` header (seconds-from-now).
  resetAtMs: number;
  // Total budget for the window. Callers expose it as
  // `X-RateLimit-Limit` so clients know what they're being
  // measured against.
  limit: number;
};

export type Limiter = {
  limit(key: string): Promise<LimiterResult>;
  name: "memory" | "redis";
};

function createMemoryLimiter(
  maxRequests: number,
  duration: Duration,
): Limiter {
  const windowMs = parseDurationMs(duration);
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async limit(key: string) {
      const now = Date.now();
      const entry = windows.get(key);

      if (!entry || now >= entry.resetAt) {
        const resetAt = now + windowMs;
        windows.set(key, { count: 1, resetAt });
        // unref so this timer doesn't keep the Node event loop alive
        // after the dev server is killed.
        setTimeout(() => windows.delete(key), windowMs).unref?.();
        return {
          success: true,
          remainingPoints: maxRequests - 1,
          resetAtMs: resetAt,
          limit: maxRequests,
        };
      }

      entry.count++;

      if (entry.count > maxRequests) {
        return {
          success: false,
          remainingPoints: 0,
          resetAtMs: entry.resetAt,
          limit: maxRequests,
        };
      }

      return {
        success: true,
        remainingPoints: maxRequests - entry.count,
        resetAtMs: entry.resetAt,
        limit: maxRequests,
      };
    },
    name: "memory",
  };
}

function createRedisLimiter(
  maxRequests: number,
  duration: Duration,
): Limiter {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(maxRequests, duration),
    prefix: "officehours-rl",
    analytics: false,
  });
  return {
    async limit(key: string) {
      const r = await ratelimit.limit(key);
      return {
        success: r.success,
        remainingPoints: r.remaining,
        resetAtMs: r.reset,
        limit: r.limit,
      };
    },
    name: "redis",
  };
}

export function createRatelimit(
  requests: number,
  duration: Duration,
): Limiter {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return createRedisLimiter(requests, duration);
  }
  return createMemoryLimiter(requests, duration);
}
