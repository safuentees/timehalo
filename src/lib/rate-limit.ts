import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
  resetAtMs: number;
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
