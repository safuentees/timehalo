import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  hasScope,
  scopesFor,
  WORKSPACE_SCOPES,
} from "@/lib/workspaces";
import {
  createTestUser,
  fakeContext,
  tearDownTestHost,
  upgradeWorkspaceToPro,
} from "../../../test/fixtures";

// B1 — workspace + membership + invitation surface. Scope matrix
// + procedure contracts. Booking / webhook / audit are not yet
// workspace-scoped (deferred to a follow-up); this suite locks the
// new primitives in isolation.

const callRouter = createCaller(appRouter);
const SLUG = "vitest-workspace";

async function purgeWorkspaces(slugs: string[]) {
  // Delete invitations first (no FK from membership), then memberships
  // (would cascade with workspace anyway), then workspaces. Doing it
  // explicitly avoids cross-test residue when slug re-use is needed.
  for (const slug of slugs) {
    const ws = await prisma.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!ws) continue;
    await prisma.invitation.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.membership.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
  }
}

describe("workspace scope matrix", () => {
  it("OWNER grants every scope", () => {
    for (const scope of WORKSPACE_SCOPES) {
      expect(hasScope("OWNER", scope)).toBe(true);
    }
  });

  it("ADMIN grants writes except workspace.write", () => {
    expect(hasScope("ADMIN", "members.write")).toBe(true);
    expect(hasScope("ADMIN", "bookings.write")).toBe(true);
    expect(hasScope("ADMIN", "webhooks.write")).toBe(true);
    expect(hasScope("ADMIN", "workspace.write")).toBe(false);
  });

  it("MEMBER grants reads + bookings.write only", () => {
    expect(hasScope("MEMBER", "bookings.write")).toBe(true);
    expect(hasScope("MEMBER", "bookings.read")).toBe(true);
    expect(hasScope("MEMBER", "members.write")).toBe(false);
    expect(hasScope("MEMBER", "webhooks.write")).toBe(false);
  });

  it("VIEWER grants no writes", () => {
    expect(hasScope("VIEWER", "bookings.read")).toBe(true);
    expect(hasScope("VIEWER", "bookings.write")).toBe(false);
    expect(hasScope("VIEWER", "members.write")).toBe(false);
    expect(hasScope("VIEWER", "workspace.write")).toBe(false);
  });

  it("scopesFor returns the same set hasScope reports", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      const list = scopesFor(role);
      for (const scope of list) {
        expect(hasScope(role, scope)).toBe(true);
      }
    }
  });
});

describe("workspaces.create + list + get", () => {
  let owner: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-owner");
  });
  beforeEach(async () => {
    await purgeWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeWorkspaces([SLUG]);
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

    const stranger = await createTestUser("vitest-stranger");
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

describe("workspaces.invite + invitations.accept", () => {
  let owner: { id: string };
  let invitee: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-inv-owner");
    invitee = await createTestUser("vitest-inv-invitee");
  });
  beforeEach(async () => {
    await purgeWorkspaces([SLUG]);
    await prisma.task.deleteMany({});
  });
  afterAll(async () => {
    await purgeWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
    await tearDownTestHost(invitee.id);
  });

  it("creates an invitation row + enqueues an email Task", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    const inv = await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role: "MEMBER",
    });
    expect(inv.email).toBe("invitee@example.com");

    const tasks = await prisma.task.findMany({
      where: { type: "emailSend" },
      select: { payload: true },
    });
    const inviteTask = tasks.find((t) =>
      t.payload.includes("workspace-invite"),
    );
    expect(inviteTask).toBeDefined();
  });

  it("invite rejects ADMIN grant from a non-owner", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });

    // Issue an arbitrary MEMBER invite (won't accept; just to push
    // through the early-MEMBER gate before swapping our own role
    // below).
    await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "first-invitee@example.com",
      role: "MEMBER",
    });

    // Demote ourselves to ADMIN to test the gate (using direct DB
    // edit since setMemberRole forbids changing OWNER).
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    await prisma.membership.updateMany({
      where: { workspaceId: ws.id, userId: owner.id },
      data: { role: "ADMIN" },
    });

    await expect(
      ownerCaller.workspaces.invite({
        slug: SLUG,
        email: "stranger@example.com",
        role: "ADMIN",
      }),
    ).rejects.toThrow(/owner can invite ADMIN|FORBIDDEN/i);
  });

  it("accept binds the invitation to the logged-in user as a Membership", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role: "MEMBER",
    });

    // Read the token directly — we don't have email delivery in tests.
    const stored = await prisma.invitation.findFirstOrThrow({
      where: {},
      select: { token: true, id: true, workspaceId: true },
    });

    const inviteeCaller = callRouter(fakeContext({ userId: invitee.id }));
    const result = await inviteeCaller.invitations.accept({
      token: stored.token,
    });
    expect(result.workspaceId).toBe(stored.workspaceId);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: invitee.id, workspaceId: stored.workspaceId },
      select: { role: true },
    });
    expect(membership.role).toBe("MEMBER");

    const after = await prisma.invitation.findUniqueOrThrow({
      where: { id: stored.id },
      select: { acceptedAt: true },
    });
    expect(after.acceptedAt).not.toBeNull();
  });

  it("accept rejects a second use (already accepted)", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role: "MEMBER",
    });
    const stored = await prisma.invitation.findFirstOrThrow({
      where: {},
      select: { token: true },
    });
    const inviteeCaller = callRouter(fakeContext({ userId: invitee.id }));
    await inviteeCaller.invitations.accept({ token: stored.token });
    await expect(
      inviteeCaller.invitations.accept({ token: stored.token }),
    ).rejects.toThrow(/already accepted|CONFLICT/i);
  });

  it("accept rejects an expired invitation", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role: "MEMBER",
    });
    // Expire it.
    await prisma.invitation.updateMany({
      where: {},
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const stored = await prisma.invitation.findFirstOrThrow({
      where: {},
      select: { token: true },
    });
    const inviteeCaller = callRouter(fakeContext({ userId: invitee.id }));
    await expect(
      inviteeCaller.invitations.accept({ token: stored.token }),
    ).rejects.toThrow(/expired|BAD_REQUEST/i);
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
    await purgeWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
    await tearDownTestHost(member.id);
  });

  it("setMemberRole flips a MEMBER → VIEWER", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    // Add the member directly (skip invitation flow).
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

describe("invitations.preview", () => {
  let owner: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-preview-owner");
  });
  beforeEach(async () => {
    await purgeWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
  });

  it("returns workspace name + role + expired flag", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Vitest Co",
    });
    await upgradeWorkspaceToPro({ slug: SLUG });
    await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role: "ADMIN",
    });
    const stored = await prisma.invitation.findFirstOrThrow({
      where: {},
      select: { token: true },
    });

    const anonCaller = callRouter(fakeContext({}));
    const preview = await anonCaller.invitations.preview({
      token: stored.token,
    });
    expect(preview.workspace.name).toBe("Vitest Co");
    expect(preview.role).toBe("ADMIN");
    expect(preview.expired).toBe(false);
  });

  it("NOT_FOUND for unknown token", async () => {
    const anonCaller = callRouter(fakeContext({}));
    await expect(
      anonCaller.invitations.preview({ token: "no-such-token" }),
    ).rejects.toThrow(TRPCError);
  });
});
