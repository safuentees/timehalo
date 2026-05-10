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
const HANDLE = "vitest-data-export";

describe("users.exportData — GDPR / CCPA data export", () => {
  let host: { id: string; handle: string; email: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("requires authentication", async () => {
    const caller = callRouter(fakeContext());
    await expect(caller.users.exportData()).rejects.toThrow(TRPCError);
  });

  it("returns user profile + relations for the calling user", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const dump = await caller.users.exportData();

    expect(dump.schemaVersion).toBe(1);
    expect(dump.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(dump.user.id).toBe(host.id);
    expect(dump.user.handle).toBe(host.handle);
    expect(dump.user.email).toBe(host.email);

    expect(dump.availabilityRanges.length).toBe(7);

    expect(dump.ownedWorkspaces.length).toBe(1);
    expect(dump.memberships.length).toBe(1);
    expect(dump.memberships[0].role).toBe("OWNER");

    expect(dump.bookings).toEqual([]);
    expect(dump.webhookSubscriptions).toEqual([]);
    expect(dump.userFeatures).toEqual([]);
    expect(dump.calendarCredentials).toEqual([]);
  });

  it("includes the host's bookings (deleted = false AND deleted = true)", async () => {
    const visitorCaller = callRouter(fakeContext());
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const caller = callRouter(fakeContext({ userId: host.id }));
    const dump = await caller.users.exportData();

    expect(dump.bookings.length).toBe(1);
    expect(dump.bookings[0].visitorEmail).toBe("maya@example.com");
    expect(dump.bookings[0].deleted).toBe(false);
  });

  it("does NOT leak encrypted calendar tokens", async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.calendarCredential.create({
      data: {
        userId: host.id,
        provider: "GOOGLE",
        externalAccountId: "test-account-id",
        externalAccountEmail: "host@example.com",
        accessToken: "v1:encrypted-payload-here",
        refreshToken: "v1:encrypted-refresh-here",
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        scope: "https://www.googleapis.com/auth/calendar.readonly",
      },
    });

    const caller = callRouter(fakeContext({ userId: host.id }));
    const dump = await caller.users.exportData();

    expect(dump.calendarCredentials.length).toBe(1);
    const cred = dump.calendarCredentials[0] as Record<string, unknown>;
    expect(cred.provider).toBe("GOOGLE");
    expect(cred.externalAccountEmail).toBe("host@example.com");
    expect(cred).not.toHaveProperty("accessToken");
    expect(cred).not.toHaveProperty("refreshToken");

    await prisma.calendarCredential.deleteMany({ where: { userId: host.id } });
  });
});
