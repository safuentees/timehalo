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
    const ip = `test-rl-burst:${crypto.randomUUID()}`;

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
      }
      consumed++;
    }
    expect(consumed).toBe(LIMIT);

    await expect(fire(ip, slot)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("buckets independently by IP — different IPs don't share limits", async () => {
    const ipA = `test-rl-a:${crypto.randomUUID()}`;
    const ipB = `test-rl-b:${crypto.randomUUID()}`;
    const slot = tomorrowAtMinute(15).toISOString();

    for (let i = 0; i < LIMIT; i++) {
      try { await fire(ipA, slot); } catch { /* CONFLICT ok */ }
    }
    await expect(fire(ipA, slot)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    await expect(fire(ipB, slot)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
