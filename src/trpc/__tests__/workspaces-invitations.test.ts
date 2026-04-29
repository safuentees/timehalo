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
  createTestUser,
  fakeContext,
  purgeTestWorkspaces,
  tearDownTestHost,
  upgradeWorkspaceToPro,
} from "../../../test/fixtures";

// B1 — workspaces.invite + invitations.accept + invitations.preview.
// CRUD half lives in workspaces-lifecycle.test.ts; pure scope matrix
// in workspaces-scopes.test.ts.

const callRouter = createCaller(appRouter);

// File-local slug so cross-file teardown order stays unambiguous.
const SLUG = "vitest-workspace-invitations";

describe("workspaces.invite + invitations.accept", () => {
  let owner: { id: string };
  let invitee: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-inv-owner");
    invitee = await createTestUser("vitest-inv-invitee");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
    await prisma.task.deleteMany({});
  });
  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
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

describe("invitations.preview", () => {
  let owner: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-preview-owner");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
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
