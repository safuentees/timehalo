import "server-only";

// Fixed-window in-memory rate limiter — ported from rallly's pattern
// (apps/web/src/lib/rate-limit/index.ts:29-81). Keeps the project
// shippable without any infra. To swap in Upstash Redis for prod:
//
//   1. pnpm add @upstash/ratelimit @upstash/redis
//   2. import { Ratelimit } from "@upstash/ratelimit"
//   3. import { Redis } from "@upstash/redis"
//   4. In createRatelimit, when process.env.UPSTASH_REDIS_REST_URL is
//      set, return a Ratelimit({ redis, limiter: Ratelimit.fixedWindow(...) })
//      wrapper that matches the shape of createMemoryLimiter — see
//      rallly lines 62-78 for the exact return shape.
//
// The memory limiter cleans up entries with `setTimeout(...).unref?.()`
// so the dev server's event loop doesn't stay alive forever after
// `pnpm dev` exits.

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
        windows.set(key, { count: 1, resetAt: now + windowMs });
        // unref so this timer doesn't keep the Node event loop alive
        // after the dev server is killed.
        setTimeout(() => windows.delete(key), windowMs).unref?.();
        return { success: true, remainingPoints: maxRequests - 1 };
      }

      entry.count++;

      if (entry.count > maxRequests) {
        return { success: false, remainingPoints: 0 };
      }

      return { success: true, remainingPoints: maxRequests - entry.count };
    },
    name: "memory",
  };
}

export function createRatelimit(
  requests: number,
  duration: Duration,
): Limiter {
  // TODO(prod): when UPSTASH_REDIS_REST_URL is set, return the Redis
  // branch instead. Same return shape — caller code doesn't change.
  return createMemoryLimiter(requests, duration);
}
