import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  createTestUser,
  createTestWorkspaceForUser,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);

describe("workspaces.update (B5)", () => {
  let owner: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestHost("vitest-ws-update");
  });
  afterAll(async () => {
    await tearDownTestHost(owner.id);
  });

  it("renames + changes slug atomically", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: "to-rename",
      name: "Original",
    });
    try {
      const updated = await caller.workspaces.update({
        slug: ws.slug,
        name: "Renamed",
        newSlug: "renamed-ws",
      });
      expect(updated.slug).toBe("renamed-ws");
      expect(updated.name).toBe("Renamed");
    } finally {
      await prisma.workspace.deleteMany({
        where: { slug: { in: ["to-rename", "renamed-ws"] } },
      });
    }
  });

  it("CONFLICT when newSlug is already taken", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const a = await caller.workspaces.create({ slug: "wsa", name: "A" });
    const b = await caller.workspaces.create({ slug: "wsb", name: "B" });
    try {
      await expect(
        caller.workspaces.update({ slug: a.slug, newSlug: "wsb" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await prisma.workspace.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });

  it("FORBIDDEN for MEMBER role", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: "ws-member-test",
      name: "Member test",
    });
    const member = await createTestUser("vitest-ws-update-member");
    try {
      await prisma.membership.create({
        data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" },
      });
      const memberCaller = callRouter(fakeContext({ userId: member.id }));
      await expect(
        memberCaller.workspaces.update({
          slug: ws.slug,
          name: "Hijack",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await tearDownTestHost(member.id);
      await prisma.workspace.delete({ where: { id: ws.id } });
    }
  });
});

describe("workspaces.delete (B5)", () => {
  it("deletes a non-primary owned workspace", async () => {
    const owner = await createTestHost("vitest-ws-delete");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const extra = await caller.workspaces.create({
        slug: "extra-to-delete",
        name: "Extra",
      });
      await caller.workspaces.delete({ slug: extra.slug });
      const list = await caller.workspaces.list();
      expect(list.some((w) => w.slug === extra.slug)).toBe(false);
    } finally {
      await tearDownTestHost(owner.id);
    }
  });

  it("PRECONDITION_FAILED when deleting the user's only owned workspace", async () => {
    const owner = await createTestHost("vitest-ws-delete-only");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workspaces.delete({ slug: owner.handle }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    } finally {
      await tearDownTestHost(owner.id);
    }
  });

  it("FORBIDDEN for ADMIN role", async () => {
    const owner = await createTestHost("vitest-ws-delete-admin-owner");
    const admin = await createTestUser("vitest-ws-delete-admin");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const extra = await caller.workspaces.create({
        slug: "admin-test-ws",
        name: "Admin test",
      });
      await prisma.membership.create({
        data: { workspaceId: extra.id, userId: admin.id, role: "ADMIN" },
      });
      const adminCaller = callRouter(fakeContext({ userId: admin.id }));
      await expect(
        adminCaller.workspaces.delete({ slug: extra.slug }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await tearDownTestHost(admin.id);
      await tearDownTestHost(owner.id);
    }
  });
});

describe("workspaces.leave (B5)", () => {
  it("removes the caller's membership when caller is not the owner", async () => {
    const owner = await createTestHost("vitest-ws-leave-owner");
    const member = await createTestUser("vitest-ws-leave-member");
    try {
      const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
      const ws = await ownerCaller.workspaces.create({
        slug: "leavable",
        name: "Leavable",
      });
      await prisma.membership.create({
        data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" },
      });

      const memberCaller = callRouter(fakeContext({ userId: member.id }));
      await memberCaller.workspaces.leave({ slug: ws.slug });

      const remaining = await prisma.membership.findFirst({
        where: { workspaceId: ws.id, userId: member.id },
        select: { id: true },
      });
      expect(remaining).toBeNull();
      const ownerStillIn = await prisma.membership.findFirst({
        where: { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
        select: { id: true },
      });
      expect(ownerStillIn).not.toBeNull();
    } finally {
      await tearDownTestHost(member.id);
      await tearDownTestHost(owner.id);
    }
  });

  it("FORBIDDEN when the OWNER tries to leave", async () => {
    const owner = await createTestHost("vitest-ws-leave-owner-blocked");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workspaces.leave({ slug: owner.handle }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await tearDownTestHost(owner.id);
    }
  });

  it("NOT_FOUND for non-members", async () => {
    const owner = await createTestHost("vitest-ws-leave-stranger-owner");
    const stranger = await createTestUser("vitest-ws-leave-stranger");
    try {
      const strangerCaller = callRouter(fakeContext({ userId: stranger.id }));
      await expect(
        strangerCaller.workspaces.leave({ slug: owner.handle }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await tearDownTestHost(stranger.id);
      await tearDownTestHost(owner.id);
    }
  });
});

describe("workspaces.transferOwnership (B5)", () => {
  it("swaps OWNER ↔ ADMIN atomically + updates Workspace.ownerId", async () => {
    const oldOwner = await createTestHost("vitest-ws-transfer-old");
    const newOwner = await createTestUser("vitest-ws-transfer-new");
    try {
      const oldCaller = callRouter(fakeContext({ userId: oldOwner.id }));
      const ws = await oldCaller.workspaces.create({
        slug: "transferable",
        name: "Transferable",
      });
      await prisma.membership.create({
        data: { workspaceId: ws.id, userId: newOwner.id, role: "ADMIN" },
      });

      await oldCaller.workspaces.transferOwnership({
        slug: ws.slug,
        newOwnerUserId: newOwner.id,
      });

      const refreshed = await prisma.workspace.findUniqueOrThrow({
        where: { id: ws.id },
        select: { ownerId: true },
      });
      expect(refreshed.ownerId).toBe(newOwner.id);
      const oldRole = await prisma.membership.findFirstOrThrow({
        where: { workspaceId: ws.id, userId: oldOwner.id },
        select: { role: true },
      });
      expect(oldRole.role).toBe("ADMIN");
      const newRole = await prisma.membership.findFirstOrThrow({
        where: { workspaceId: ws.id, userId: newOwner.id },
        select: { role: true },
      });
      expect(newRole.role).toBe("OWNER");
    } finally {
      await tearDownTestHost(newOwner.id);
      await tearDownTestHost(oldOwner.id);
    }
  });

  it("NOT_FOUND when target isn't a member of the workspace", async () => {
    const owner = await createTestHost("vitest-tx-nomember-own");
    const stranger = await createTestUser("vitest-tx-nomember-out");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workspaces.transferOwnership({
          slug: owner.handle,
          newOwnerUserId: stranger.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await tearDownTestHost(stranger.id);
      await tearDownTestHost(owner.id);
    }
  });

  it("FORBIDDEN for non-owner caller", async () => {
    const owner = await createTestHost("vitest-tx-nonowner-own");
    const admin = await createTestUser("vitest-tx-nonowner-adm");
    try {
      const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
      const ws = await ownerCaller.workspaces.create({
        slug: "ws-transfer-noowner",
        name: "Test",
      });
      await prisma.membership.create({
        data: { workspaceId: ws.id, userId: admin.id, role: "ADMIN" },
      });
      const adminCaller = callRouter(fakeContext({ userId: admin.id }));
      await expect(
        adminCaller.workspaces.transferOwnership({
          slug: ws.slug,
          newOwnerUserId: admin.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await tearDownTestHost(admin.id);
      await tearDownTestHost(owner.id);
    }
  });

  it("BAD_REQUEST when transferring to self", async () => {
    const owner = await createTestHost("vitest-ws-transfer-self");
    try {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await expect(
        caller.workspaces.transferOwnership({
          slug: owner.handle,
          newOwnerUserId: owner.id,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await tearDownTestHost(owner.id);
    }
  });
});

void createTestWorkspaceForUser;
