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

// Tests for §10.1 item 10 — feature flags.
//
// Decision matrix (from src/lib/feature-flags.ts):
//   no DB row              → FEATURE_DEFAULTS[slug]
//   row enabled=false      → off
//   row enabled=true,
//     no UserFeatures rows → globally on
//   row enabled=true,
//     UserFeatures exist   → on only for assigned users
//
// Tests cover each branch + the users.featureFlags tRPC query.

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

    // No UserFeatures rows for any user — globally on.
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
    // Anonymous (no userId) does NOT qualify when scoping is on.
    expect(await isFeatureEnabled("live-queue", undefined)).toBe(false);
    // Different user without an assignment row.
    expect(await isFeatureEnabled("live-queue", "different-user-id")).toBe(
      false,
    );
  });

  it("getEnabledFeatures returns the full map for the user", async () => {
    // No DB rows — all flags fall back to FEATURE_DEFAULTS.
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
    // No DB rows yet → defaults.
    expect(flags["live-queue"]).toBe(FEATURE_DEFAULTS["live-queue"]);
  });
});
