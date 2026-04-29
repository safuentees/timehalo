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

// B.PT9 — workspaces.inviteMany. Bulk-invite procedure with all-
// or-nothing semantics: any role-rule rejection or plan-cap
// overflow aborts before a single Invitation row commits.
describe("workspaces.inviteMany (B.PT9)", () => {
  let owner: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-pt9-owner");
  });

  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
    await prisma.task.deleteMany({});
  });

  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
  });

  it("creates one Invitation row + one email Task per invite", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });

    const result = await ownerCaller.workspaces.inviteMany({
      slug: SLUG,
      invites: [
        { email: "a@example.com", role: "MEMBER" },
        { email: "b@example.com", role: "VIEWER" },
        { email: "c@example.com", role: "ADMIN" },
      ],
    });
    expect(result).toHaveLength(3);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    const invitations = await prisma.invitation.findMany({
      where: { workspaceId: ws.id },
      select: { email: true, role: true },
    });
    expect(invitations).toHaveLength(3);
    const tasks = await prisma.task.findMany({
      where: { type: "emailSend" },
      select: { referenceUid: true },
    });
    const inviteTasks = tasks.filter(
      (t) =>
        t.referenceUid !== null &&
        t.referenceUid.includes(":email"),
    );
    expect(inviteTasks).toHaveLength(3);
  });

  it("rejects the whole batch when any row would push past the plan cap", async () => {
    // FREE plan caps at 1 member (the owner). One pending invite
    // would bring members+pending to 2, which equals the cap-plus-
    // one-pending bound. A 2-row batch overflows; the procedure
    // must reject ALL rows (no partial commit).
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    // Skip the pro upgrade — want FREE cap behavior here.

    await expect(
      ownerCaller.workspaces.inviteMany({
        slug: SLUG,
        invites: [
          { email: "a@example.com", role: "MEMBER" },
          { email: "b@example.com", role: "MEMBER" },
        ],
      }),
    ).rejects.toThrow(/Member cap|FORBIDDEN/i);

    // Confirm no partial state — zero invitations exist.
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    const count = await prisma.invitation.count({
      where: { workspaceId: ws.id },
    });
    expect(count).toBe(0);
  });

  it("rejects the whole batch when ANY row carries an OWNER role", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });

    await expect(
      ownerCaller.workspaces.inviteMany({
        slug: SLUG,
        invites: [
          { email: "a@example.com", role: "MEMBER" },
          { email: "b@example.com", role: "OWNER" },
        ],
      }),
    ).rejects.toThrow(/Owner can't be granted|FORBIDDEN/i);
  });

  it("rejects ADMIN grant from a non-owner caller", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    await prisma.membership.updateMany({
      where: { workspaceId: ws.id, userId: owner.id },
      data: { role: "ADMIN" },
    });

    await expect(
      ownerCaller.workspaces.inviteMany({
        slug: SLUG,
        invites: [
          { email: "a@example.com", role: "MEMBER" },
          { email: "b@example.com", role: "ADMIN" },
        ],
      }),
    ).rejects.toThrow(/owner can invite ADMIN|FORBIDDEN/i);
  });

  it("rejects an empty array at the schema layer", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });

    await expect(
      ownerCaller.workspaces.inviteMany({ slug: SLUG, invites: [] }),
    ).rejects.toThrow();
  });
});

// B.PT8 — resendInvitation + updateInvitationRole.
//
// Both procedures pass the same scope check (members.write) as
// invite + revoke, so we cover the happy path + the role-rule
// rejection cases that mirror invite's gates. The token-rotation
// behavior is the load-bearing detail for resend; we assert the
// new token differs from the old one + the expiresAt has been
// pushed forward.
describe("workspaces.resendInvitation + updateInvitationRole (B.PT8)", () => {
  let owner: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-pt8-owner");
  });

  beforeEach(async () => {
    await purgeTestWorkspaces([SLUG]);
    await prisma.task.deleteMany({});
  });

  afterAll(async () => {
    await purgeTestWorkspaces([SLUG]);
    await tearDownTestHost(owner.id);
  });

  async function seedInvitation(role: "ADMIN" | "MEMBER" | "VIEWER" = "MEMBER") {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Vitest Co" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    const inv = await ownerCaller.workspaces.invite({
      slug: SLUG,
      email: "invitee@example.com",
      role,
    });
    return { ownerCaller, invitationId: inv.id };
  }

  it("resendInvitation rotates the token + pushes expiresAt forward", async () => {
    const { ownerCaller, invitationId } = await seedInvitation();
    const before = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { token: true, expiresAt: true },
    });

    const resent = await ownerCaller.workspaces.resendInvitation({
      slug: SLUG,
      invitationId,
    });
    const after = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { token: true, expiresAt: true },
    });

    expect(after.token).not.toBe(before.token);
    expect(after.expiresAt.getTime()).toBeGreaterThan(
      before.expiresAt.getTime(),
    );
    expect(resent.email).toBe("invitee@example.com");

    // A new email Task was enqueued with a `:resend:` referenceUid
    // suffix so the dedup index doesn't collide with the original.
    const tasks = await prisma.task.findMany({
      where: { type: "emailSend" },
      select: { referenceUid: true },
    });
    const resendTask = tasks.find(
      (t) =>
        t.referenceUid !== null &&
        t.referenceUid.includes(`:${invitationId}:resend:`),
    );
    expect(resendTask).toBeDefined();
  });

  it("resendInvitation rejects an already-accepted invitation", async () => {
    const { ownerCaller, invitationId } = await seedInvitation();
    // Mark accepted directly to bypass the accept flow.
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    });

    await expect(
      ownerCaller.workspaces.resendInvitation({
        slug: SLUG,
        invitationId,
      }),
    ).rejects.toThrow(/already accepted|NOT_FOUND/i);
  });

  it("updateInvitationRole flips MEMBER → VIEWER", async () => {
    const { ownerCaller, invitationId } = await seedInvitation("MEMBER");
    await ownerCaller.workspaces.updateInvitationRole({
      slug: SLUG,
      invitationId,
      role: "VIEWER",
    });
    const row = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { role: true },
    });
    expect(row.role).toBe("VIEWER");
  });

  it("updateInvitationRole rejects ADMIN grant from a non-owner caller", async () => {
    const { ownerCaller, invitationId } = await seedInvitation("MEMBER");
    // Demote ourselves to ADMIN to test the same gate the invite
    // procedure carries (we replicate the rule there).
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    await prisma.membership.updateMany({
      where: { workspaceId: ws.id, userId: owner.id },
      data: { role: "ADMIN" },
    });
    await expect(
      ownerCaller.workspaces.updateInvitationRole({
        slug: SLUG,
        invitationId,
        role: "ADMIN",
      }),
    ).rejects.toThrow(/owner can grant ADMIN|FORBIDDEN/i);
  });

  it("updateInvitationRole rejects OWNER role outright", async () => {
    const { ownerCaller, invitationId } = await seedInvitation("MEMBER");
    await expect(
      ownerCaller.workspaces.updateInvitationRole({
        slug: SLUG,
        invitationId,
        role: "OWNER",
      }),
    ).rejects.toThrow(/Owner can't be granted|FORBIDDEN/i);
  });
});
