import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  createTestEventTypeHostPool,
  fakeContext,
  tearDownTestHost,
  wipeTransientState,
} from "../../../test/fixtures";

const HANDLE = "vitest-durations";
const callRouter = createCaller(appRouter);

describe("users.setDurationsList + me.durations", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    await createTestEventTypeHostPool({
      hostHandle: HANDLE,
      members: [{ userId: host.id, isFixed: true }],
    });
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
    await prisma.eventType.updateMany({
      where: { slug: HANDLE },
      data: { durationMinsList: "[]" },
    });
  });

  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("me.durations is empty + defaults to 15 when host has not configured", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const me = await caller.users.me();
    expect(me.durations).toEqual({ defaultMinutes: 15, list: [] });
  });

  it("setDurationsList writes a sorted, deduped list and reads back via me", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const result = await caller.users.setDurationsList({
      minutes: [60, 15, 30, 15, 60],
    });
    expect(result.minutes).toEqual([15, 30, 60]);

    const me = await caller.users.me();
    expect(me.durations.list).toEqual([15, 30, 60]);
  });

  it("clears the list when minutes is empty", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.users.setDurationsList({ minutes: [15, 30] });
    await caller.users.setDurationsList({ minutes: [] });
    const me = await caller.users.me();
    expect(me.durations.list).toEqual([]);
  });

  it("rejects values below 5 minutes", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ minutes: [4] }),
    ).rejects.toThrow();
  });

  it("rejects values above 480 minutes", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ minutes: [481] }),
    ).rejects.toThrow();
  });

  it("rejects more than 8 entries", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({
        minutes: [10, 15, 20, 25, 30, 45, 60, 90, 120],
      }),
    ).rejects.toThrow();
  });

  it("getByHandle exposes the configured list to anonymous visitors", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.users.setDurationsList({ minutes: [15, 30, 60] });

    const anon = callRouter(fakeContext());
    const profile = await anon.users.getByHandle({ handle: HANDLE });
    expect(profile.durationChoices).toEqual([15, 30, 60]);
    expect(profile.defaultDurationMinutes).toBe(15);
  });

  it("getByHandle falls back to [durationMins] when host has not configured a list", async () => {
    const anon = callRouter(fakeContext());
    const profile = await anon.users.getByHandle({ handle: HANDLE });
    expect(profile.durationChoices).toEqual([15]);
    expect(profile.defaultDurationMinutes).toBe(15);
  });

  it("PRECONDITION_FAILED when the caller has no handle yet", async () => {
    await prisma.user.update({
      where: { id: host.id },
      data: { handle: null },
    });
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ minutes: [30] }),
    ).rejects.toThrow(TRPCError);
    await prisma.user.update({
      where: { id: host.id },
      data: { handle: HANDLE },
    });
  });
});
