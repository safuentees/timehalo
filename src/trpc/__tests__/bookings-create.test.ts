import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { createTestHost, tearDownTestHost } from "../../../test/fixtures";

const callRouter = createCaller(appRouter);

const TEST_HANDLE = "vitest-host";

function createTestContext() {
  return {
    user: null,
    ipIdentifier: `test:${crypto.randomUUID()}`,
    cookies: new Map<string, string>(),
  };
}

function nextMondayAt10UTC(): Date {
  const d = new Date();
  const offset = ((1 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

describe("bookings.create idempotency", () => {
  let hostId: string;
  let slotIso: string;

  beforeAll(async () => {
    const host = await createTestHost(TEST_HANDLE);
    hostId = host.id;
    slotIso = nextMondayAt10UTC().toISOString();
  });

  beforeEach(async () => {
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({ where: { hostId } });
  });

  afterAll(async () => {
    await tearDownTestHost(hostId);
  });

  it("returns the same booking when called twice with the same key", async () => {
    const caller = callRouter(createTestContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    const first = await caller.bookings.create(input);
    const second = await caller.bookings.create(input);

    expect(first.publicUid).toBe(second.publicUid);

    const count = await prisma.booking.count({
      where: { idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it("rejects with CONFLICT when same slot but different key", async () => {
    const caller = callRouter(createTestContext());
    const baseInput = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    await caller.bookings.create({
      ...baseInput,
      idempotencyKey: crypto.randomUUID(),
    });

    await expect(
      caller.bookings.create({
        ...baseInput,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("survives 3 concurrent submits with the same key (race protection)", async () => {
    const caller = callRouter(createTestContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    const [a, b, c] = await Promise.all([
      caller.bookings.create(input),
      caller.bookings.create(input),
      caller.bookings.create(input),
    ]);

    expect(a.publicUid).toBe(b.publicUid);
    expect(b.publicUid).toBe(c.publicUid);

    const count = await prisma.booking.count({
      where: { idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it("writes one CREATED audit row per successful booking, none for retries", async () => {
    const caller = callRouter(createTestContext());
    const idempotencyKey = crypto.randomUUID();
    const input = {
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    };

    await caller.bookings.create(input);
    await caller.bookings.create(input); // retry, should short-circuit
    await caller.bookings.create(input); // another retry

    const audits = await prisma.bookingAudit.findMany({
      where: { action: "CREATED" },
    });
    expect(audits.length).toBe(1);
  });

  it("writes the host's primary workspaceId on the booking row", async () => {
    const caller = callRouter(createTestContext());
    const idempotencyKey = crypto.randomUUID();
    await caller.bookings.create({
      handle: TEST_HANDLE,
      slotStart: slotIso,
      idempotencyKey,
      visitorName: "Alice",
      visitorEmail: "alice@test.local",
    });

    const row = await prisma.booking.findFirstOrThrow({
      where: { idempotencyKey },
      select: { workspaceId: true, hostId: true },
    });
    const primary = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: row.hostId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    expect(row.workspaceId).toBe(primary.id);
  });
});
