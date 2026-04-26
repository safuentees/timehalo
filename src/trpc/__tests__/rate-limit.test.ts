import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// Tests for §10.1 item 3 — rate limiting on bookings.create.
//
// The limiter is a process-wide in-memory Map keyed by
// `${procedureName}:${ipIdentifier}` with a 1-minute window. Each
// test uses a unique ipIdentifier so they don't bleed into each
// other (the limiter persists between tests in the same process).
//
// We don't reset the limiter between tests — the bucketing-by-IP
// design means parallel tests with distinct IPs are isolated by
// construction.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-ratelimit";
const LIMIT = 10; // matches createRateLimitMiddleware('bookings.create', 10, '1 m')

describe("rate limit — bookings.create", () => {
  let host: { id: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  async function fire(ip: string, slotIso: string) {
    const caller = callRouter(fakeContext({ ipIdentifier: ip }));
    return caller.bookings.create({
      handle: HANDLE,
      slotStart: slotIso,
      idempotencyKey: crypto.randomUUID(),
      visitorName: "Visitor",
      visitorEmail: "v@test.local",
    });
  }

  it("returns TOO_MANY_REQUESTS on the 11th request from the same IP", async () => {
    // Unique IP for this test so it doesn't pick up another test's
    // bucket.
    const ip = `test-rl-burst:${crypto.randomUUID()}`;

    // Burn through 10 with valid + colliding slots — they all consume
    // a token regardless of whether they create a booking. The first
    // succeeds; the next 9 trip CONFLICT (same slot, different keys).
    // What matters: each request is counted by the limiter.
    const slot = tomorrowAtMinute(0).toISOString();
    let consumed = 0;
    for (let i = 0; i < LIMIT; i++) {
      try {
        await fire(ip, slot);
      } catch (err) {
        if (err instanceof TRPCError && err.code === "TOO_MANY_REQUESTS") {
          throw new Error(
            `Limiter fired early at request ${i} (limit is ${LIMIT})`,
          );
        }
        // CONFLICT / BAD_REQUEST are fine — still consumes a token.
      }
      consumed++;
    }
    expect(consumed).toBe(LIMIT);

    // 11th request: should be limited.
    await expect(fire(ip, slot)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("buckets independently by IP — different IPs don't share limits", async () => {
    const ipA = `test-rl-a:${crypto.randomUUID()}`;
    const ipB = `test-rl-b:${crypto.randomUUID()}`;
    const slot = tomorrowAtMinute(15).toISOString();

    // Burn out IP A.
    for (let i = 0; i < LIMIT; i++) {
      try { await fire(ipA, slot); } catch { /* CONFLICT ok */ }
    }
    await expect(fire(ipA, slot)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    // IP B is untouched — first request from it should NOT throw
    // TOO_MANY_REQUESTS (it'll throw CONFLICT because the slot is
    // taken, which is a different code).
    await expect(fire(ipB, slot)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
