import "server-only";

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

export function createRatelimit(
  requests: number,
  duration: Duration,
): Limiter {
  return createMemoryLimiter(requests, duration);
}
