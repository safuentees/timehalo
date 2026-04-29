import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// A9 — adminProcedure gate + admin sub-router (featureFlags / webhooks
// / audit). Setup: env-list admin handle + a non-admin handle, then
// each test toggles ctx between the two callers.

const callRouter = createCaller(appRouter);
const ADMIN_HANDLE = "vitest-admin";
const REGULAR_HANDLE = "vitest-user";

describe("admin gate", () => {
  let admin: { id: string };
  let regular: { id: string };

  beforeAll(async () => {
    admin = await createTestHost(ADMIN_HANDLE);
    regular = await createTestHost(REGULAR_HANDLE);
    vi.stubEnv("OFFICEHOURS_ADMIN_HANDLES", ADMIN_HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(admin.id);
    await wipeTransientState(regular.id);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await tearDownTestHost(admin.id);
    await tearDownTestHost(regular.id);
  });

  it("rejects anonymous callers (UNAUTHORIZED)", async () => {
    const caller = callRouter(fakeContext());
    await expect(
      caller.admin.featureFlags.list(),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects non-admin authed callers (FORBIDDEN)", async () => {
    const caller = callRouter(fakeContext({ userId: regular.id }));
    await expect(
      caller.admin.featureFlags.list(),
    ).rejects.toThrow(/Admin only|FORBIDDEN/i);
  });

  it("admits an admin handle", async () => {
    const caller = callRouter(fakeContext({ userId: admin.id }));
    const list = await caller.admin.featureFlags.list();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe("admin.featureFlags", () => {
  let admin: { id: string };
  let regular: { id: string; handle: string };

  beforeAll(async () => {
    admin = await createTestHost(`${ADMIN_HANDLE}-ff`);
    regular = await createTestHost(`${REGULAR_HANDLE}-ff`);
    vi.stubEnv("OFFICEHOURS_ADMIN_HANDLES", `${ADMIN_HANDLE}-ff`);
  });
  beforeEach(async () => {
    await wipeTransientState(admin.id);
    await wipeTransientState(regular.id);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await tearDownTestHost(admin.id);
    await tearDownTestHost(regular.id);
  });

  it("list reports defaults when no DB row exists", async () => {
    const caller = callRouter(fakeContext({ userId: admin.id }));
    const flags = await caller.admin.featureFlags.list();
    const live = flags.find((f) => f.slug === "live-queue");
    expect(live).toBeDefined();
    expect(live?.hasRow).toBe(false);
    expect(live?.enabled).toBe(true); // default in FEATURE_DEFAULTS
    expect(live?.assignments).toEqual([]);
  });

  it("setEnabled creates a row + flips it", async () => {
    const caller = callRouter(fakeContext({ userId: admin.id }));
    await caller.admin.featureFlags.setEnabled({
      slug: "live-queue",
      enabled: false,
    });
    const flags = await caller.admin.featureFlags.list();
    const live = flags.find((f) => f.slug === "live-queue");
    expect(live?.hasRow).toBe(true);
    expect(live?.enabled).toBe(false);
  });

  it("assign + unassign by handle", async () => {
    const caller = callRouter(fakeContext({ userId: admin.id }));
    await caller.admin.featureFlags.assign({
      slug: "live-queue",
      handle: regular.handle,
    });
    let flags = await caller.admin.featureFlags.list();
    let live = flags.find((f) => f.slug === "live-queue");
    expect(live?.assignments.map((a) => a.handle)).toEqual([
      regular.handle,
    ]);

    await caller.admin.featureFlags.unassign({
      slug: "live-queue",
      handle: regular.handle,
    });
    flags = await caller.admin.featureFlags.list();
    live = flags.find((f) => f.slug === "live-queue");
    expect(live?.assignments).toEqual([]);
  });

  it("assign rejects unknown handle", async () => {
    const caller = callRouter(fakeContext({ userId: admin.id }));
    await expect(
      caller.admin.featureFlags.assign({
        slug: "live-queue",
        handle: "no-such-handle",
      }),
    ).rejects.toThrow(/No user|NOT_FOUND/i);
  });
});

describe("admin.webhooks", () => {
  let admin: { id: string };
  let regular: { id: string; handle: string };

  beforeAll(async () => {
    admin = await createTestHost(`${ADMIN_HANDLE}-wh`);
    regular = await createTestHost(`${REGULAR_HANDLE}-wh`);
    vi.stubEnv("OFFICEHOURS_ADMIN_HANDLES", `${ADMIN_HANDLE}-wh`);
  });
  beforeEach(async () => {
    await wipeTransientState(admin.id);
    await wipeTransientState(regular.id);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await tearDownTestHost(admin.id);
    await tearDownTestHost(regular.id);
  });

  it("listAll surfaces every subscription across users", async () => {
    const regularCaller = callRouter(fakeContext({ userId: regular.id }));
    await regularCaller.webhooks.create({
      slug: regular.handle,
      subscriberUrl: "https://receiver.test/hook",
      events: ["booking.created"],
    });
    const adminCaller = callRouter(fakeContext({ userId: admin.id }));
    const subs = await adminCaller.admin.webhooks.listAll();
    expect(subs.some((s) => s.user.handle === regular.handle)).toBe(true);
  });

  it("retry resets attempts + scheduledAt", async () => {
    // Seed a "permanently failed" Task row directly.
    const task = await prisma.task.create({
      data: {
        type: "webhookDelivery",
        payload: JSON.stringify({}),
        attempts: 99,
        maxAttempts: 3,
        lastError: "Receiver returned 500",
        lastFailedAttemptAt: new Date(),
        scheduledAt: new Date(Date.now() + 86_400_000),
      },
    });
    const adminCaller = callRouter(fakeContext({ userId: admin.id }));
    await adminCaller.admin.webhooks.retry({ taskId: task.id });
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: {
        attempts: true,
        scheduledAt: true,
        lastError: true,
      },
    });
    expect(after.attempts).toBe(0);
    expect(after.lastError).toBeNull();
    // scheduledAt moved into the past or now (cron picks up next tick)
    expect(after.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("admin.audit.byBookingUid", () => {
  let admin: { id: string };
  let host: { id: string; handle: string };

  beforeAll(async () => {
    admin = await createTestHost(`${ADMIN_HANDLE}-au`);
    host = await createTestHost(`${REGULAR_HANDLE}-au`);
    vi.stubEnv("OFFICEHOURS_ADMIN_HANDLES", `${ADMIN_HANDLE}-au`);
  });
  beforeEach(async () => {
    await wipeTransientState(admin.id);
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await tearDownTestHost(admin.id);
    await tearDownTestHost(host.id);
  });

  it("returns the audit chain for a created+cancelled booking", async () => {
    const visitorCaller = callRouter(fakeContext({}));
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: created.publicUid });

    const adminCaller = callRouter(fakeContext({ userId: admin.id }));
    const trail = await adminCaller.admin.audit.byBookingUid({
      bookingUid: created.publicUid,
    });
    const actions = trail.map((t) => t.action);
    expect(actions).toEqual(["CREATED", "CANCELLED"]);
  });
});
