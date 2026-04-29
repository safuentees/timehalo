import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
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

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-webhooks";

describe("webhooks — subscription management + scheduling", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  describe("webhooks.create", () => {
    it("returns the secret exactly once on creation", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      const result = await caller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(result.subscriberUrl).toBe("https://example.com/hook");
    });

    it("rejects bad URL via zod schema", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      await expect(
        caller.webhooks.create({
          slug: HANDLE,
          subscriberUrl: "not-a-url",
          events: ["booking.created"],
        }),
      ).rejects.toThrow();
    });

    it("rejects empty events array via zod schema", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      await expect(
        caller.webhooks.create({
          slug: HANDLE,
          subscriberUrl: "https://example.com/hook",
          events: [],
        }),
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND when the caller isn't a member of the workspace (B1)", async () => {
      const stranger = await createTestHost("vitest-webhooks-stranger");
      try {
        const strangerCaller = callRouter(
          fakeContext({ userId: stranger.id }),
        );
        await expect(
          strangerCaller.webhooks.create({
            slug: HANDLE,
            subscriberUrl: "https://example.com/hook",
            events: ["booking.created"],
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });
  });

  describe("webhooks.list", () => {
    it("never returns the secret in list responses", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      await caller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      const list = await caller.webhooks.list({ slug: HANDLE });
      expect(list.length).toBe(1);
      expect("secret" in list[0]).toBe(false);
    });

    it("scopes results to the requested workspace (B1)", async () => {
      const callerA = callRouter(fakeContext({ userId: host.id }));
      await callerA.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/a",
        events: ["booking.created"],
      });

      const stranger = await createTestHost("vitest-webhooks-list-stranger");
      try {
        const callerB = callRouter(fakeContext({ userId: stranger.id }));
        const listA = await callerA.webhooks.list({ slug: HANDLE });
        const listB = await callerB.webhooks.list({ slug: stranger.handle });
        expect(listA.length).toBe(1);
        expect(listB.length).toBe(0);
        await expect(
          callerB.webhooks.list({ slug: HANDLE }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });
  });

  describe("webhooks.delete", () => {
    it("removes a webhook the caller has scope to manage", async () => {
      const caller = callRouter(fakeContext({ userId: host.id }));
      const created = await caller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      await caller.webhooks.delete({
        slug: HANDLE,
        publicUid: created.publicUid,
      });
      expect((await caller.webhooks.list({ slug: HANDLE })).length).toBe(0);
    });

    it("throws NOT_FOUND for a stranger trying to delete inside another workspace (B1)", async () => {
      const callerA = callRouter(fakeContext({ userId: host.id }));
      const created = await callerA.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      const stranger = await createTestHost("vitest-webhooks-delete-stranger");
      try {
        const callerB = callRouter(fakeContext({ userId: stranger.id }));
        await expect(
          callerB.webhooks.delete({
            slug: HANDLE,
            publicUid: created.publicUid,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });

        expect((await callerA.webhooks.list({ slug: HANDLE })).length).toBe(1);
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });
  });

  describe("scheduling on bookings.create", () => {
    it("writes a Task row when an active matching webhook exists", async () => {
      const hostCaller = callRouter(fakeContext({ userId: host.id }));
      await hostCaller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      const visitorCaller = callRouter(fakeContext());
      const booking = await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(0).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Visitor",
        visitorEmail: "v@test.local",
      });

      const tasks = await prisma.task.findMany({
        where: { type: "webhookDelivery" },
      });
      expect(tasks.length).toBe(1);
      expect(tasks[0].referenceUid).toBe(
        `${booking.publicUid}:booking.created:${(await prisma.webhookSubscription.findFirst())!.id}`,
      );
      expect(tasks[0].attempts).toBe(0);
      expect(tasks[0].succeededAt).toBeNull();
    });

    it("does NOT schedule a Task when no webhook is registered", async () => {
      const visitorCaller = callRouter(fakeContext());
      await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(15).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Visitor",
        visitorEmail: "v@test.local",
      });

      const tasks = await prisma.task.count({
        where: { type: "webhookDelivery" },
      });
      expect(tasks).toBe(0);
    });

    it("does NOT schedule a Task for a webhook that's inactive", async () => {
      const hostCaller = callRouter(fakeContext({ userId: host.id }));
      const created = await hostCaller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });
      await prisma.webhookSubscription.update({
        where: { publicUid: created.publicUid },
        data: { active: false },
      });

      const visitorCaller = callRouter(fakeContext());
      await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(30).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Visitor",
        visitorEmail: "v@test.local",
      });

      const tasks = await prisma.task.count({
        where: { type: "webhookDelivery" },
      });
      expect(tasks).toBe(0);
    });

    it("idempotency retry does NOT double-schedule the Task", async () => {
      const hostCaller = callRouter(fakeContext({ userId: host.id }));
      await hostCaller.webhooks.create({
        slug: HANDLE,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });

      const visitorCaller = callRouter(fakeContext());
      const idempotencyKey = crypto.randomUUID();
      const submit = () =>
        visitorCaller.bookings.create({
          handle: HANDLE,
          slotStart: tomorrowAtMinute(45).toISOString(),
          idempotencyKey,
          visitorName: "Visitor",
          visitorEmail: "v@test.local",
        });

      const a = await submit();
      const b = await submit(); // retry
      expect(a.publicUid).toBe(b.publicUid);

      const tasks = await prisma.task.count({
        where: { type: "webhookDelivery" },
      });
      expect(tasks).toBe(1);
    });
  });
});
