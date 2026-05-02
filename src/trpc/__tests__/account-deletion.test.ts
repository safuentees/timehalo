import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { TASK_TYPE_EMAIL_SEND, type EmailSendPayload } from "@/lib/tasks";
import {
  createTestHost,
  fakeContext,
  safeTearDownByHandle,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// Tests for A4 — users.deleteAccount procedure.
// Coverage: cascade across every onDelete: Cascade relation,
// BookingAudit survives (no FK), email enqueue, auth gate.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-account-delete";

describe("users.deleteAccount — cascade + audit survival + email", () => {
  let host: { id: string; handle: string; email: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    // The test under test calls `users.deleteAccount` so the host row
    // is gone by the time we tear down. `safeTearDownByHandle` handles
    // both the present-host and absent-host cases.
    await safeTearDownByHandle(HANDLE);
  });

  it("requires authentication", async () => {
    const caller = callRouter(fakeContext());
    await expect(caller.users.deleteAccount()).rejects.toThrow(TRPCError);
  });

  it("cascades the user row + every Cascade relation", async () => {
    // Seed every cascading relation we know about.
    const visitorCaller = callRouter(fakeContext({}));
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.webhooks.create({
      slug: host.handle,
      subscriberUrl: "https://receiver.test/hook",
      events: ["booking.created"],
    });

    // Pre-delete: counts should be non-zero.
    const beforeBookings = await prisma.booking.count({
      where: { hostId: host.id },
    });
    const beforeWebhooks = await prisma.webhookSubscription.count({
      where: { userId: host.id },
    });
    const beforeAvail = await prisma.availabilityRange.count({
      where: { userId: host.id },
    });
    expect(beforeBookings).toBeGreaterThan(0);
    expect(beforeWebhooks).toBeGreaterThan(0);
    expect(beforeAvail).toBeGreaterThan(0);

    await hostCaller.users.deleteAccount();

    expect(
      await prisma.user.findUnique({ where: { id: host.id } }),
    ).toBeNull();
    expect(
      await prisma.booking.count({ where: { hostId: host.id } }),
    ).toBe(0);
    expect(
      await prisma.webhookSubscription.count({ where: { userId: host.id } }),
    ).toBe(0);
    expect(
      await prisma.availabilityRange.count({ where: { userId: host.id } }),
    ).toBe(0);
  });

  it("preserves BookingAudit rows after the user is gone", async () => {
    // Re-seed (prior test deleted the user).
    host = await createTestHost(HANDLE);
    const visitorCaller = callRouter(fakeContext({}));
    const booking = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.users.deleteAccount();

    // BookingAudit has no FK to Booking — rows survive even after the
    // booking + user are gone. Critical for "who created what when" forensics.
    const audit = await prisma.bookingAudit.findMany({
      where: { bookingUid: booking.publicUid },
      select: { action: true, actor: true },
    });
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.some((a) => a.action === "CREATED")).toBe(true);
  });

  it("removes the user from OTHER workspaces' member lists (B.PT83 — QA-6)", async () => {
    // Re-seed (prior test deleted the user).
    host = await createTestHost(HANDLE);

    // Provision a SECOND user that owns a DIFFERENT workspace.
    // The host (about to delete their account) joins that second
    // workspace as a member. This is the scenario from QA-6: workspace
    // owner sees the deleted user lingering in their member list.
    const otherOwner = await createTestHost("vitest-account-delete-other");
    const otherCaller = callRouter(fakeContext({ userId: otherOwner.id }));
    const otherWorkspace = await otherCaller.workspaces.create({
      slug: "vitest-acct-del-other-ws",
      name: "Other workspace",
    });
    await prisma.membership.create({
      data: {
        workspaceId: otherWorkspace.id,
        userId: host.id,
        role: "MEMBER",
      },
    });

    // Sanity — the membership exists before deletion.
    const before = await prisma.membership.findFirst({
      where: { workspaceId: otherWorkspace.id, userId: host.id },
    });
    expect(before).not.toBeNull();

    // Self-delete.
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.users.deleteAccount();

    // Membership row should be gone — without the explicit cleanup in
    // `users.deleteAccount`, libsql leaves the row orphaned and the
    // workspace owner's `listMembers` shows it with `user: null`.
    const after = await prisma.membership.findFirst({
      where: { workspaceId: otherWorkspace.id, userId: host.id },
    });
    expect(after).toBeNull();

    // The other workspace itself must survive — only the deleted user's
    // own owned workspaces should cascade away.
    const survivingWs = await prisma.workspace.findUnique({
      where: { id: otherWorkspace.id },
      select: { id: true },
    });
    expect(survivingWs).not.toBeNull();

    // Cleanup.
    await prisma.workspace.deleteMany({ where: { id: otherWorkspace.id } });
    await safeTearDownByHandle("vitest-account-delete-other");
  });

  it("enqueues an account-deleted email before deleting", async () => {
    host = await createTestHost(HANDLE);
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.users.deleteAccount();

    const tasks = await prisma.task.findMany({
      where: { type: TASK_TYPE_EMAIL_SEND },
      select: { payload: true, referenceUid: true },
    });
    const accountDeletedTask = tasks.find((t) => {
      const p = JSON.parse(t.payload) as EmailSendPayload;
      return p.template === "account-deleted";
    });
    expect(accountDeletedTask).toBeDefined();
    if (!accountDeletedTask) return;

    const payload = JSON.parse(accountDeletedTask.payload) as EmailSendPayload;
    expect(payload.to).toBe(host.email);
    expect(accountDeletedTask.referenceUid).toMatch(
      /^user:.+:account-deleted:/,
    );
  });
});
