import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRatelimit } from "@/lib/rate-limit";

const { redisLimit } = vi.hoisted(() => ({ redisLimit: vi.fn() }));

vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static fixedWindow() { return {}; }
    limit = redisLimit;
  },
}));

describe("Redis rate-limit availability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T16:00:00Z"));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    redisLimit.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the healthy distributed result", async () => {
    redisLimit.mockResolvedValue({ success: true, remaining: 1, reset: 123, limit: 5 });
    await expect(createRatelimit(5, "1 m").limit("ip-a")).resolves.toEqual({
      success: true, remainingPoints: 1, resetAtMs: 123, limit: 5,
    });
  });

  it.each([undefined, "cacheBlock", "denyList"])("preserves Redis denial (%s)", async (reason) => {
    redisLimit.mockResolvedValue({ success: false, remaining: 0, reset: 123, limit: 5, reason });
    await expect(createRatelimit(5, "1 m").limit("ip-a")).resolves.toMatchObject({
      success: false, remainingPoints: 0, resetAtMs: 123,
    });
  });

  it("caps outage requests independently by key and resets the window", async () => {
    redisLimit.mockRejectedValue(Object.assign(new Error("DNS unavailable"), { code: "ENOTFOUND" }));
    const limiter = createRatelimit(2, "1 m");
    expect((await limiter.limit("ip-a")).success).toBe(true);
    expect((await limiter.limit("ip-a")).success).toBe(true);
    expect((await limiter.limit("ip-a")).success).toBe(false);
    expect((await limiter.limit("ip-b")).success).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await limiter.limit("ip-a")).success).toBe(true);
  });

  it("enforces the cap when the SDK permits a timed-out request", async () => {
    redisLimit.mockResolvedValue({ success: true, remaining: 0, reset: 0, limit: 2, reason: "timeout" });
    const limiter = createRatelimit(2, "1 m");
    expect((await limiter.limit("ip-a")).success).toBe(true);
    expect((await limiter.limit("ip-a")).success).toBe(true);
    expect((await limiter.limit("ip-a")).success).toBe(false);
  });

  it("counts healthy traffic during an outage and resumes Redis on recovery", async () => {
    redisLimit.mockResolvedValue({ success: true, remaining: 1, reset: 123, limit: 2 });
    const limiter = createRatelimit(2, "1 m");
    await limiter.limit("ip-a");
    await limiter.limit("ip-a");
    redisLimit.mockRejectedValueOnce(new Error("Redis offline"));
    expect((await limiter.limit("ip-a")).success).toBe(false);
    await expect(limiter.limit("ip-a")).resolves.toMatchObject({ success: true, resetAtMs: 123 });
  });
});
