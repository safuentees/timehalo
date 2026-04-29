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
  createTestUser,
  fakeContext,
  purgeTestWorkspaces,
  tearDownTestHost,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);

const SLUG = "vitest-workspace-lifecycle";

describe("workspaces.create + list + get", () => {
  let owner: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-lc-owner");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
  });

  it("create mints a workspace + an OWNER membership for the caller", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    expect(ws.slug).toBe(SLUG);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: owner.id },
      select: { role: true },
    });
    expect(membership.role).toBe("OWNER");
  });

  it("create rejects duplicate slug with CONFLICT", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: SLUG, name: "First" });
    await expect(
      caller.workspaces.create({ slug: SLUG, name: "Second" }),
    ).rejects.toThrow(/taken|CONFLICT/i);
  });

  it("list returns workspaces the caller is a member of, role-tagged", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    const list = await caller.workspaces.list();
    expect(list.length).toBeGreaterThan(0);
    const found = list.find((w) => w.slug === SLUG);
    expect(found?.role).toBe("OWNER");
  });

  it("get NOT_FOUND for non-members (no existence leak)", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: SLUG, name: "Vitest Co" });

    const stranger = await createTestUser("vitest-lc-stranger");
    try {
      const strangerCaller = callRouter(fakeContext({ userId: stranger.id }));
      await expect(
        strangerCaller.workspaces.get({ slug: SLUG }),
      ).rejects.toThrow(/not found|NOT_FOUND/i);
    } finally {
      await tearDownTestHost(stranger.id);
    }
  });

  it("get returns role + scopes for the caller", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    const view = await caller.workspaces.get({ slug: SLUG });
    expect(view.callerRole).toBe("OWNER");
    expect(view.callerScopes).toContain("workspace.write");
  });
});

describe("workspaces.setMemberRole + removeMember", () => {
  let owner: { id: string };
  let member: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-role-owner");
    member = await createTestUser("vitest-role-member");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
    await tearDownTestHost(member.id);
  });

  it("setMemberRole flips a MEMBER → VIEWER", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.id,
        role: "MEMBER",
      },
    });

    await ownerCaller.workspaces.setMemberRole({
      slug: SLUG,
      userId: member.id,
      role: "VIEWER",
    });
    const row = await prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: member.id },
      select: { role: true, assignedBy: true },
    });
    expect(row.role).toBe("VIEWER");
    expect(row.assignedBy).toBe(owner.id);
  });

  it("setMemberRole refuses to touch an OWNER row", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await expect(
      ownerCaller.workspaces.setMemberRole({
        slug: SLUG,
        userId: owner.id,
        role: "MEMBER",
      }),
    ).rejects.toThrow(/Owner|FORBIDDEN/i);
  });

  it("removeMember refuses OWNER", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await expect(
      ownerCaller.workspaces.removeMember({
        slug: SLUG,
        userId: owner.id,
      }),
    ).rejects.toThrow(/Owner|FORBIDDEN/i);
  });

  it("removeMember works for non-owner", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.id,
        role: "MEMBER",
      },
    });
    await ownerCaller.workspaces.removeMember({
      slug: SLUG,
      userId: member.id,
    });
    const remaining = await prisma.membership.count({
      where: { workspaceId: ws.id },
    });
    expect(remaining).toBe(1); // just OWNER
  });

  it("scope-violating caller gets FORBIDDEN", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.id,
        role: "VIEWER",
      },
    });
    const memberCaller = callRouter(fakeContext({ userId: member.id }));
    await expect(
      memberCaller.workspaces.invite({
        slug: SLUG,
        email: "x@example.com",
        role: "MEMBER",
      }),
    ).rejects.toThrow(/can't|FORBIDDEN/i);
  });
});
