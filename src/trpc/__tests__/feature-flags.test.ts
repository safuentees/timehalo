import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  isFeatureEnabled,
  getEnabledFeatures,
  FEATURE_DEFAULTS,
} from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { appRouter, createCaller } from "@/trpc/router";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-flags";

describe("feature flags resolution", () => {
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

  it("returns FEATURE_DEFAULTS when no DB row exists", async () => {
    const result = await isFeatureEnabled("live-queue", host.id);
    expect(result).toBe(FEATURE_DEFAULTS["live-queue"]); // currently true
  });

  it("returns false when DB row is enabled=false (kill switch)", async () => {
    await prisma.feature.create({
      data: { slug: "live-queue", enabled: false },
    });

    const result = await isFeatureEnabled("live-queue", host.id);
    expect(result).toBe(false);
  });

  it("returns true globally when enabled=true and no UserFeatures", async () => {
    await prisma.feature.create({
      data: { slug: "live-queue", enabled: true },
    });

    expect(await isFeatureEnabled("live-queue", host.id)).toBe(true);
    expect(await isFeatureEnabled("live-queue", "any-other-user")).toBe(true);
  });

  it("scopes to assigned users when UserFeatures rows exist", async () => {
    await prisma.feature.create({
      data: { slug: "live-queue", enabled: true },
    });
    await prisma.userFeatures.create({
      data: { userId: host.id, featureSlug: "live-queue" },
    });

    expect(await isFeatureEnabled("live-queue", host.id)).toBe(true);
    expect(await isFeatureEnabled("live-queue", undefined)).toBe(false);
    expect(await isFeatureEnabled("live-queue", "different-user-id")).toBe(
      false,
    );
  });

  it("getEnabledFeatures returns the full map for the user", async () => {
    const map = await getEnabledFeatures(host.id);
    expect(map).toEqual(FEATURE_DEFAULTS);
  });

  it("getEnabledFeatures reflects per-user assignments", async () => {
    await prisma.feature.create({
      data: { slug: "live-queue", enabled: true },
    });
    await prisma.userFeatures.create({
      data: { userId: host.id, featureSlug: "live-queue" },
    });

    expect((await getEnabledFeatures(host.id))["live-queue"]).toBe(true);
    expect((await getEnabledFeatures("other-user-id"))["live-queue"]).toBe(
      false,
    );
  });

  it("users.featureFlags tRPC query returns the resolved map", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const flags = await caller.users.featureFlags();
    expect(flags["live-queue"]).toBe(FEATURE_DEFAULTS["live-queue"]);
  });
});
