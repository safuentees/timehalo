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
      data: { durationMinsList: JSON.stringify([15]) },
    });
  });

  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("me.durations exposes the seeded default list ([durationMins]) for new hosts", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const me = await caller.users.me();
    expect(me.durations).toEqual({ defaultMinutes: 15, list: [15] });
  });

  it("me.durations.list is empty when the host has explicitly cleared it", async () => {
    await prisma.eventType.updateMany({
      where: { slug: HANDLE },
      data: { durationMinsList: "[]" },
    });
    const caller = callRouter(fakeContext({ userId: host.id }));
    const me = await caller.users.me();
    expect(me.durations.list).toEqual([]);
  });

  it("setDurationsList writes a sorted, deduped list and reads back via me", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const result = await caller.users.setDurationsList({
      list: [
        { minutes: 60 },
        { minutes: 15 },
        { minutes: 30 },
        { minutes: 15 },
        { minutes: 60 },
      ],
    });
    expect(result.list.map((o) => o.minutes)).toEqual([15, 30, 60]);

    const me = await caller.users.me();
    expect(me.durations.list.map((o) => o.minutes)).toEqual([15, 30, 60]);
  });

  it("clears the list when list is empty", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.users.setDurationsList({
      list: [{ minutes: 15 }, { minutes: 30 }],
    });
    await caller.users.setDurationsList({ list: [] });
    const me = await caller.users.me();
    expect(me.durations.list).toEqual([]);
  });

  it("rejects values below 5 minutes", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ list: [{ minutes: 4 }] }),
    ).rejects.toThrow();
  });

  it("rejects values above 480 minutes", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ list: [{ minutes: 481 }] }),
    ).rejects.toThrow();
  });

  it("rejects more than 8 entries", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({
        list: [
          { minutes: 10 },
          { minutes: 15 },
          { minutes: 20 },
          { minutes: 25 },
          { minutes: 30 },
          { minutes: 45 },
          { minutes: 60 },
          { minutes: 90 },
          { minutes: 120 },
        ],
      }),
    ).rejects.toThrow();
  });

  it("getByHandle exposes the configured list to anonymous visitors", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.users.setDurationsList({
      list: [{ minutes: 15 }, { minutes: 30 }, { minutes: 60 }],
    });

    const anon = callRouter(fakeContext());
    const profile = await anon.users.getByHandle({ handle: HANDLE });
    expect(profile.durationChoices.map((o) => o.minutes)).toEqual([
      15, 30, 60,
    ]);
    expect(profile.defaultDurationMinutes).toBe(15);
  });

  it("getByHandle returns the seeded default for new hosts", async () => {
    const anon = callRouter(fakeContext());
    const profile = await anon.users.getByHandle({ handle: HANDLE });
    expect(profile.durationChoices.map((o) => o.minutes)).toEqual([15]);
    expect(profile.defaultDurationMinutes).toBe(15);
  });

  it("getByHandle returns an empty durationChoices when the host has cleared the list", async () => {
    await prisma.eventType.updateMany({
      where: { slug: HANDLE },
      data: { durationMinsList: "[]" },
    });
    const anon = callRouter(fakeContext());
    const profile = await anon.users.getByHandle({ handle: HANDLE });
    expect(profile.durationChoices.map((o) => o.minutes)).toEqual([]);
  });

  it("PRECONDITION_FAILED when the caller has no handle yet", async () => {
    await prisma.user.update({
      where: { id: host.id },
      data: { handle: null },
    });
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.users.setDurationsList({ list: [{ minutes: 30 }] }),
    ).rejects.toThrow(TRPCError);
    await prisma.user.update({
      where: { id: host.id },
      data: { handle: HANDLE },
    });
  });
});
