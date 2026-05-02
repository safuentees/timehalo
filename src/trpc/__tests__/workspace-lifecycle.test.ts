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
  fakeContext,
  purgeTestWorkspaces,
  tearDownTestHost,
  tomorrowAt10UTC,
} from "../../../test/fixtures";

// B5 — workspace lifecycle four-pack contract tests:
//   • update (rename + change slug; CONFLICT on dup; gate on
//     workspace.write).
//   • delete (OWNER only; PRECONDITION_FAILED on last owned
//     workspace; cascades wipe related rows).
//   • leave (non-OWNER members; OWNER blocked; idempotent NOT_FOUND).
//   • transferOwnership (OWNER atomic swap; target must be a
//     member; recipient promotes, caller demotes to ADMIN; assignedBy
//     stamped on both rows).
//
// Pattern follows .claude/rules/testing.md: shared host via beforeAll,
// per-test workspace purge via purgeTestWorkspaces, single afterAll
// teardown. Slug discriminators avoid cross-describe collision.

const callRouter = createCaller(appRouter);

// ─── workspaces.update ───────────────────────────────────────────────

const UPDATE_SLUG_FROM = "vitest-ws-update-from";
const UPDATE_SLUG_TO = "vitest-ws-update-to";
const UPDATE_SLUG_OTHER = "vitest-ws-update-other";

describe("workspaces.update (B5)", () => {
  let owner: { id: string; handle: string };
  let member: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestHost("vitest-ws-update-owner");
    member = await createTestUser("vitest-ws-update-member");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([
      UPDATE_SLUG_FROM,
      UPDATE_SLUG_TO,
      UPDATE_SLUG_OTHER,
    ]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([
      UPDATE_SLUG_FROM,
      UPDATE_SLUG_TO,
      UPDATE_SLUG_OTHER,
    ]);
    await tearDownTestHost(member.id);
    await tearDownTestHost(owner.id);
  });

  it("renames + changes slug atomically", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: UPDATE_SLUG_FROM, name: "Original" });

    const updated = await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      name: "Renamed",
      newSlug: UPDATE_SLUG_TO,
    });
    expect(updated.slug).toBe(UPDATE_SLUG_TO);
    expect(updated.name).toBe("Renamed");
  });

  it("renames without changing slug (name-only)", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: UPDATE_SLUG_FROM, name: "Original" });

    const updated = await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      name: "Just Renamed",
    });
    expect(updated.slug).toBe(UPDATE_SLUG_FROM);
    expect(updated.name).toBe("Just Renamed");
  });

  it("changes slug without changing name (slug-only)", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "Keep this name",
    });

    const updated = await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });
    expect(updated.slug).toBe(UPDATE_SLUG_TO);
    expect(updated.name).toBe(ws.name);
  });

  it("empty input is a safe no-op", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "Steady",
    });

    const updated = await caller.workspaces.update({ slug: UPDATE_SLUG_FROM });
    expect(updated.slug).toBe(ws.slug);
    expect(updated.name).toBe(ws.name);
  });

  it("the old slug is no longer reachable after a rename", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: UPDATE_SLUG_FROM, name: "From" });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });

    await expect(
      caller.workspaces.get({ slug: UPDATE_SLUG_FROM }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const reached = await caller.workspaces.get({ slug: UPDATE_SLUG_TO });
    expect(reached.callerRole).toBe("OWNER");
  });

  it("CONFLICT when newSlug is already taken", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: UPDATE_SLUG_FROM, name: "A" });
    await caller.workspaces.create({ slug: UPDATE_SLUG_OTHER, name: "B" });

    await expect(
      caller.workspaces.update({
        slug: UPDATE_SLUG_FROM,
        newSlug: UPDATE_SLUG_OTHER,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("FORBIDDEN for MEMBER role", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "Member test",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" },
    });

    const memberCaller = callRouter(fakeContext({ userId: member.id }));
    await expect(
      memberCaller.workspaces.update({
        slug: UPDATE_SLUG_FROM,
        name: "Hijack",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // B.PT82 — slug rename writes a WorkspaceSlugHistory row so back-stack
  // URLs holding the prior slug can resolve via redirect instead of
  // 404'ing. The page-level redirect itself is exercised in dev (no
  // route-render testing inside vitest); these cases lock down the
  // procedure-side contract that feeds it.
  it("records the prior slug in WorkspaceSlugHistory on rename", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "History test",
    });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });
    const history = await prisma.workspaceSlugHistory.findUnique({
      where: { oldSlug: UPDATE_SLUG_FROM },
    });
    expect(history).not.toBeNull();
    expect(history?.workspaceId).toBe(ws.id);
  });

  it("name-only update does NOT write a history row", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "Quiet",
    });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      name: "Still quiet",
    });
    const history = await prisma.workspaceSlugHistory.findUnique({
      where: { oldSlug: UPDATE_SLUG_FROM },
    });
    expect(history).toBeNull();
  });

  it("rotating A→B→A→B keeps a single history row (upsert path)", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({ slug: UPDATE_SLUG_FROM, name: "A" });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_TO,
      newSlug: UPDATE_SLUG_FROM,
    });
    await caller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });
    // Only one row should exist for UPDATE_SLUG_FROM (the workspace's
    // last "departed-from" slug); the in-between TO row was deleted
    // when we renamed back away from it (A becoming current implies
    // A is no longer a known former slug).
    const allRows = await prisma.workspaceSlugHistory.findMany({
      where: { oldSlug: { in: [UPDATE_SLUG_FROM, UPDATE_SLUG_TO] } },
    });
    expect(allRows.map((r) => r.oldSlug).sort()).toEqual([UPDATE_SLUG_FROM]);
  });

  it("a different workspace claiming a former slug clears the prior history", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    // Workspace A: rename FROM → TO; UPDATE_SLUG_FROM lives in history.
    await ownerCaller.workspaces.create({
      slug: UPDATE_SLUG_FROM,
      name: "First tenant",
    });
    await ownerCaller.workspaces.update({
      slug: UPDATE_SLUG_FROM,
      newSlug: UPDATE_SLUG_TO,
    });
    // Workspace B: create with UPDATE_SLUG_OTHER, then rename TO →
    // UPDATE_SLUG_FROM. The new owner takes precedence; history row
    // for UPDATE_SLUG_FROM should be cleared.
    await ownerCaller.workspaces.create({
      slug: UPDATE_SLUG_OTHER,
      name: "Second tenant",
    });
    await ownerCaller.workspaces.update({
      slug: UPDATE_SLUG_OTHER,
      newSlug: UPDATE_SLUG_FROM,
    });
    const stale = await prisma.workspaceSlugHistory.findUnique({
      where: { oldSlug: UPDATE_SLUG_FROM },
    });
    expect(stale).toBeNull();
  });
});

// ─── workspaces.delete ───────────────────────────────────────────────

const DELETE_SLUG_EXTRA = "vitest-ws-delete-extra";
const DELETE_SLUG_CASCADE = "vitest-ws-delete-cascade";
const DELETE_SLUG_ADMIN = "vitest-ws-delete-admin";

describe("workspaces.delete (B5)", () => {
  let owner: { id: string; handle: string };
  let admin: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestHost("vitest-ws-delete-owner");
    admin = await createTestUser("vitest-ws-delete-admin-user");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([
      DELETE_SLUG_EXTRA,
      DELETE_SLUG_CASCADE,
      DELETE_SLUG_ADMIN,
    ]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([
      DELETE_SLUG_EXTRA,
      DELETE_SLUG_CASCADE,
      DELETE_SLUG_ADMIN,
    ]);
    await tearDownTestHost(admin.id);
    await tearDownTestHost(owner.id);
  });

  it("deletes a non-primary owned workspace when the user owns ≥ 2", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await caller.workspaces.create({
      slug: DELETE_SLUG_EXTRA,
      name: "Extra",
    });

    const before = await prisma.workspace.count({
      where: { ownerId: owner.id },
    });
    expect(before).toBeGreaterThanOrEqual(2);

    await caller.workspaces.delete({ slug: DELETE_SLUG_EXTRA });

    const list = await caller.workspaces.list();
    expect(list.some((w) => w.slug === DELETE_SLUG_EXTRA)).toBe(false);
    const after = await prisma.workspace.count({
      where: { ownerId: owner.id },
    });
    expect(after).toBe(before - 1);
  });

  it("PRECONDITION_FAILED when deleting the user's only owned workspace", async () => {
    // The Personal workspace seeded by createTestHost is the only one
    // this user owns; deleting it must be blocked.
    const soloOwner = await createTestHost("vitest-ws-delete-solo");
    try {
      const caller = callRouter(fakeContext({ userId: soloOwner.id }));
      await expect(
        caller.workspaces.delete({ slug: soloOwner.handle }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    } finally {
      await tearDownTestHost(soloOwner.id);
    }
  });

  it("cascades to bookings, memberships, and webhook subscriptions", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await caller.workspaces.create({
      slug: DELETE_SLUG_CASCADE,
      name: "Cascade target",
    });

    // Seed every relation the procedure docstring promises to cascade.
    // We can't easily seed an api key / event type / subscription
    // in-line without pulling more fixture surface in; bookings +
    // memberships + webhook subscriptions are the high-volume relations
    // most likely to regress on a schema change.
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: admin.id, role: "ADMIN" },
    });
    await prisma.booking.create({
      data: {
        hostId: owner.id,
        workspaceId: ws.id,
        slotStart: tomorrowAt10UTC(),
        slotEnd: new Date(tomorrowAt10UTC().getTime() + 15 * 60_000),
        visitorName: "Cascade Visitor",
        visitorEmail: "cascade@example.com",
      },
    });
    await prisma.webhookSubscription.create({
      data: {
        userId: owner.id,
        workspaceId: ws.id,
        subscriberUrl: "https://receiver.test/cascade",
        events: "booking.created",
        secret: "cascade-secret".padEnd(64, "f"),
        active: true,
      },
    });

    const beforeBookings = await prisma.booking.count({
      where: { workspaceId: ws.id },
    });
    const beforeMemberships = await prisma.membership.count({
      where: { workspaceId: ws.id },
    });
    const beforeWebhooks = await prisma.webhookSubscription.count({
      where: { workspaceId: ws.id },
    });
    expect(beforeBookings).toBeGreaterThan(0);
    expect(beforeMemberships).toBeGreaterThan(0);
    expect(beforeWebhooks).toBeGreaterThan(0);

    await caller.workspaces.delete({ slug: DELETE_SLUG_CASCADE });

    expect(
      await prisma.workspace.findUnique({ where: { id: ws.id } }),
    ).toBeNull();
    expect(
      await prisma.booking.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
    expect(
      await prisma.membership.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
    expect(
      await prisma.webhookSubscription.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });

  it("FORBIDDEN for ADMIN role", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: DELETE_SLUG_ADMIN,
      name: "Admin test",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: admin.id, role: "ADMIN" },
    });

    const adminCaller = callRouter(fakeContext({ userId: admin.id }));
    await expect(
      adminCaller.workspaces.delete({ slug: DELETE_SLUG_ADMIN }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── workspaces.leave ────────────────────────────────────────────────

const LEAVE_SLUG = "vitest-ws-leave";

describe("workspaces.leave (B5)", () => {
  let owner: { id: string; handle: string };
  let member: { id: string; handle: string };
  let stranger: { id: string; handle: string };

  beforeAll(async () => {
    owner = await createTestHost("vitest-ws-leave-owner");
    member = await createTestUser("vitest-ws-leave-member");
    stranger = await createTestUser("vitest-ws-leave-stranger");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([LEAVE_SLUG]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([LEAVE_SLUG]);
    await tearDownTestHost(stranger.id);
    await tearDownTestHost(member.id);
    await tearDownTestHost(owner.id);
  });

  it("removes the caller's membership when caller is not the owner", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: LEAVE_SLUG,
      name: "Leavable",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" },
    });

    const memberCaller = callRouter(fakeContext({ userId: member.id }));
    await memberCaller.workspaces.leave({ slug: LEAVE_SLUG });

    // Membership row gone.
    const remaining = await prisma.membership.findFirst({
      where: { workspaceId: ws.id, userId: member.id },
      select: { id: true },
    });
    expect(remaining).toBeNull();
    // Workspace + OWNER membership intact.
    const ownerStillIn = await prisma.membership.findFirst({
      where: { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
      select: { id: true },
    });
    expect(ownerStillIn).not.toBeNull();
  });

  it("a second leave call by the same user is NOT_FOUND (idempotency)", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: LEAVE_SLUG,
      name: "Leavable",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" },
    });

    const memberCaller = callRouter(fakeContext({ userId: member.id }));
    await memberCaller.workspaces.leave({ slug: LEAVE_SLUG });
    // Second call — the membership is already gone. requireMembership
    // returns NOT_FOUND, which is the right "already left" semantics.
    await expect(
      memberCaller.workspaces.leave({ slug: LEAVE_SLUG }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("FORBIDDEN when the OWNER tries to leave", async () => {
    const caller = callRouter(fakeContext({ userId: owner.id }));
    await expect(
      caller.workspaces.leave({ slug: owner.handle }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("NOT_FOUND for non-members", async () => {
    const strangerCaller = callRouter(fakeContext({ userId: stranger.id }));
    await expect(
      strangerCaller.workspaces.leave({ slug: owner.handle }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── workspaces.transferOwnership ────────────────────────────────────

const TRANSFER_SLUG = "vitest-ws-transfer";
const TRANSFER_SLUG_NONOWNER = "vitest-ws-transfer-nonowner";

describe("workspaces.transferOwnership (B5)", () => {
  let oldOwner: { id: string; handle: string };
  let newOwner: { id: string; handle: string };
  let stranger: { id: string; handle: string };

  beforeAll(async () => {
    oldOwner = await createTestHost("vitest-ws-transfer-old");
    // newOwner is a full host (with their own Personal workspace) so the
    // "exercise OWNER scopes after transfer" test can call delete on the
    // transferred workspace without tripping PRECONDITION_FAILED on
    // "this is your last owned workspace".
    newOwner = await createTestHost("vitest-ws-transfer-new");
    stranger = await createTestUser("vitest-ws-transfer-stranger");
  });
  beforeEach(async () => {
    await purgeTestWorkspaces([TRANSFER_SLUG, TRANSFER_SLUG_NONOWNER]);
  });
  afterAll(async () => {
    await purgeTestWorkspaces([TRANSFER_SLUG, TRANSFER_SLUG_NONOWNER]);
    await tearDownTestHost(stranger.id);
    await tearDownTestHost(newOwner.id);
    await tearDownTestHost(oldOwner.id);
  });

  it("swaps OWNER ↔ ADMIN atomically + updates Workspace.ownerId + stamps assignedBy", async () => {
    const oldCaller = callRouter(fakeContext({ userId: oldOwner.id }));
    const ws = await oldCaller.workspaces.create({
      slug: TRANSFER_SLUG,
      name: "Transferable",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: newOwner.id, role: "ADMIN" },
    });

    await oldCaller.workspaces.transferOwnership({
      slug: TRANSFER_SLUG,
      newOwnerUserId: newOwner.id,
    });

    // Workspace.ownerId updated.
    const refreshed = await prisma.workspace.findUniqueOrThrow({
      where: { id: ws.id },
      select: { ownerId: true },
    });
    expect(refreshed.ownerId).toBe(newOwner.id);

    // Old owner is now ADMIN; assignedBy points at the new owner.
    const oldRow = await prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: oldOwner.id },
      select: { role: true, assignedBy: true },
    });
    expect(oldRow.role).toBe("ADMIN");
    expect(oldRow.assignedBy).toBe(newOwner.id);

    // New owner is now OWNER; assignedBy points at the prior owner.
    const newRow = await prisma.membership.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: newOwner.id },
      select: { role: true, assignedBy: true },
    });
    expect(newRow.role).toBe("OWNER");
    expect(newRow.assignedBy).toBe(oldOwner.id);
  });

  it("the new owner can immediately exercise OWNER scopes (update + delete)", async () => {
    const oldCaller = callRouter(fakeContext({ userId: oldOwner.id }));
    const ws = await oldCaller.workspaces.create({
      slug: TRANSFER_SLUG,
      name: "About to be theirs",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: newOwner.id, role: "ADMIN" },
    });
    await oldCaller.workspaces.transferOwnership({
      slug: TRANSFER_SLUG,
      newOwnerUserId: newOwner.id,
    });

    // Procedure path — go through the same gates a real caller hits.
    const newCaller = callRouter(fakeContext({ userId: newOwner.id }));
    const renamed = await newCaller.workspaces.update({
      slug: TRANSFER_SLUG,
      name: "Theirs now",
    });
    expect(renamed.name).toBe("Theirs now");

    await newCaller.workspaces.delete({ slug: TRANSFER_SLUG });
    expect(
      await prisma.workspace.findUnique({ where: { id: ws.id } }),
    ).toBeNull();
  });

  it("NOT_FOUND when target isn't a member of the workspace", async () => {
    const caller = callRouter(fakeContext({ userId: oldOwner.id }));
    await expect(
      caller.workspaces.transferOwnership({
        slug: oldOwner.handle,
        newOwnerUserId: stranger.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("FORBIDDEN for non-owner caller", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: oldOwner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: TRANSFER_SLUG_NONOWNER,
      name: "Test",
    });
    await prisma.membership.create({
      data: { workspaceId: ws.id, userId: newOwner.id, role: "ADMIN" },
    });
    const adminCaller = callRouter(fakeContext({ userId: newOwner.id }));
    await expect(
      adminCaller.workspaces.transferOwnership({
        slug: TRANSFER_SLUG_NONOWNER,
        newOwnerUserId: newOwner.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("BAD_REQUEST when transferring to self", async () => {
    const caller = callRouter(fakeContext({ userId: oldOwner.id }));
    await expect(
      caller.workspaces.transferOwnership({
        slug: oldOwner.handle,
        newOwnerUserId: oldOwner.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
