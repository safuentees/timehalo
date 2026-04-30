import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);

async function setWorkspacePlan(
  workspaceId: string,
  plan: "FREE" | "PRO" | "TEAM",
): Promise<void> {
  await prisma.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, plan, status: "ACTIVE" },
    update: { plan, status: "ACTIVE" },
  });
}

async function primaryWorkspaceId(userId: string): Promise<string> {
  const ws = await prisma.workspace.findFirstOrThrow({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return ws.id;
}

describe("A3 plan-gating", () => {
  let owner: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestHost("vitest-plan-owner");
  });

  beforeEach(async () => {
    await prisma.subscription.deleteMany({
      where: { workspace: { ownerId: owner.id } },
    });
    await prisma.workflow.deleteMany({ where: { userId: owner.id } });
    await prisma.webhookSubscription.deleteMany({
      where: { userId: owner.id },
    });
    await prisma.apiKey.deleteMany({
      where: { workspace: { ownerId: owner.id } },
    });
    await prisma.invitation.deleteMany({
      where: { workspace: { ownerId: owner.id } },
    });
  });

  afterAll(async () => {
    await tearDownTestHost(owner.id);
  });

  describe("webhooks.create", () => {
    it("FREE plan → FORBIDDEN", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.webhooks.create({
          slug: owner.handle,
          subscriberUrl: "https://example.com/hook",
          events: ["booking.created"],
        }),
      ).rejects.toThrow(/FREE.*does not include.*webhooks|FORBIDDEN/i);
    });

    it("PRO plan → succeeds", async () => {
      await setWorkspacePlan(await primaryWorkspaceId(owner.id), "PRO");
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.webhooks.create({
        slug: owner.handle,
        subscriberUrl: "https://example.com/hook",
        events: ["booking.created"],
      });
      expect(created.publicUid).toBeTruthy();
    });
  });

  describe("workflows.create", () => {
    it("FREE plan → FORBIDDEN", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workflows.create({
          name: "test-rule",
          trigger: "EVENT_CREATED",
          offsetMinutes: 0,
          action: "EMAIL_VISITOR",
          template: "booking-created",
          active: true,
        }),
      ).rejects.toThrow(/FREE.*does not include.*workflows|FORBIDDEN/i);
    });

    it("PRO plan → succeeds", async () => {
      await setWorkspacePlan(await primaryWorkspaceId(owner.id), "PRO");
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.workflows.create({
        name: "test-rule",
        trigger: "EVENT_CREATED",
        offsetMinutes: 0,
        action: "EMAIL_VISITOR",
        template: "booking-created",
        active: true,
      });
      expect(created.id).toBeTruthy();
    });
  });

  describe("workspaces.apiKeys.create", () => {
    it("FREE plan → FORBIDDEN", async () => {
      const slug = `vitest-plan-${owner.id.slice(0, 6)}`;
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const wsRow = await prisma.workspace.findFirstOrThrow({
        where: { ownerId: owner.id },
        select: { slug: true },
      });
      await expect(
        caller.workspaces.apiKeys.create({
          slug: wsRow.slug,
          name: "test-key",
          scopes: ["bookings.read"],
        }),
      ).rejects.toThrow(/FREE.*does not include.*api-keys|FORBIDDEN/i);
      void slug;
    });

    it("PRO plan → succeeds", async () => {
      await setWorkspacePlan(await primaryWorkspaceId(owner.id), "PRO");
      const wsRow = await prisma.workspace.findFirstOrThrow({
        where: { ownerId: owner.id },
        select: { slug: true },
      });
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.workspaces.apiKeys.create({
        slug: wsRow.slug,
        name: "test-key",
        scopes: ["bookings.read"],
      });
      expect(created.token).toMatch(/^oh_/);
    });
  });

  describe("workspaces.invite member cap", () => {
    it("FREE plan caps at 1 (just owner) — first invite blocked", async () => {
      const wsRow = await prisma.workspace.findFirstOrThrow({
        where: { ownerId: owner.id },
        select: { slug: true },
      });
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workspaces.invite({
          slug: wsRow.slug,
          email: "first@example.com",
          role: "MEMBER",
        }),
      ).rejects.toThrow(/Member cap reached for FREE.*\(1\)|FORBIDDEN/i);
    });

    it("PRO plan caps at 5 — invites 1-4 succeed, invite 5 blocked", async () => {
      const wsId = await primaryWorkspaceId(owner.id);
      await setWorkspacePlan(wsId, "PRO");
      const wsRow = await prisma.workspace.findFirstOrThrow({
        where: { id: wsId },
        select: { slug: true },
      });
      const caller = callRouter(fakeContext({ userId: owner.id }));

      for (let i = 0; i < 4; i++) {
        await caller.workspaces.invite({
          slug: wsRow.slug,
          email: `pro-${i}@example.com`,
          role: "MEMBER",
        });
      }

      await expect(
        caller.workspaces.invite({
          slug: wsRow.slug,
          email: "fifth-overflow@example.com",
          role: "MEMBER",
        }),
      ).rejects.toThrow(/Member cap reached for PRO.*\(5\)|FORBIDDEN/i);
    });
  });

  describe("users.plan", () => {
    it("FREE plan → returns FREE", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const result = await caller.users.plan();
      expect(result.plan).toBe("FREE");
    });

    it("PRO plan → returns PRO", async () => {
      await setWorkspacePlan(await primaryWorkspaceId(owner.id), "PRO");
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const result = await caller.users.plan();
      expect(result.plan).toBe("PRO");
    });

    it("ignores ctx.activeWorkspaceSlug — keys off the user's primary workspace", async () => {
      await setWorkspacePlan(await primaryWorkspaceId(owner.id), "PRO");
      const caller = callRouter(
        fakeContext({
          userId: owner.id,
          activeWorkspaceSlug: "nonexistent-slug-cookie",
        }),
      );
      const result = await caller.users.plan();
      expect(result.plan).toBe("PRO");
    });
  });
});
