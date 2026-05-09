import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Shared test fixtures. Each test file calls these in beforeAll to
// seed a host with availability that makes any 15-min slot validate
// against generateUpcomingSlots. The hostHandle is parameterized so
// parallel test files don't collide on the global @unique handle.

export type TestHost = { id: string; handle: string; email: string };

export async function createTestHost(handle: string): Promise<TestHost> {
  await prisma.user.deleteMany({ where: { handle } });
  // User + Workspace + OWNER Membership in one transaction. Mirrors
  // auth.register's pair-shape so contract tests exercise procedures
  // against a host that already has the workspace primitives the
  // booking flow now expects (Booking.workspaceId is non-null after
  // 20260427_workspace_aware_bookings).
  const host = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: `vitest-${handle}-${Date.now()}@test.local`,
        handle,
        availabilityRanges: {
          create: [
            // Every weekday 0:00–23:45 — covers any test that picks
            // an upcoming slot regardless of what day it is.
            { dayOfWeek: "MONDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "TUESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "WEDNESDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "THURSDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "FRIDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SATURDAY", startTime: "00:00", endTime: "23:45" },
            { dayOfWeek: "SUNDAY", startTime: "00:00", endTime: "23:45" },
          ],
        },
      },
      select: { id: true, handle: true, email: true },
    });
    const slugTaken = await tx.workspace.findUnique({
      where: { slug: handle },
      select: { id: true },
    });
    const ws = await tx.workspace.create({
      data: {
        slug: slugTaken ? `personal-${user.id}` : handle,
        name: "Personal",
        ownerId: user.id,
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
    });
    // A3 — seed a PRO Subscription so existing tests sail through the
    // plan gates added to webhooks.create / workflows.create /
    // workspaces.apiKeys.create / workspaces.invite. The plan-gating
    // contract test creates its own FREE workspace explicitly when it
    // wants to assert the gate fires.
    await tx.subscription.create({
      data: {
        workspaceId: ws.id,
        plan: "PRO",
        status: "ACTIVE",
      },
    });
    return user;
  });
  return { id: host.id, handle: host.handle!, email: host.email };
}

/**
 * Create an additional Workspace owned by the given user, plus an
 * OWNER Membership. Mirrors workspaces.create's pair-shape. Slug
 * defaults to a deterministic per-user fallback to keep parallel
 * tests from colliding on the @unique constraint.
 */
export async function createTestWorkspaceForUser(
  userId: string,
  slug?: string,
): Promise<{ id: string; slug: string }> {
  const finalSlug = slug ?? `vitest-ws-${userId}`;
  return prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        slug: finalSlug,
        name: "Test Workspace",
        ownerId: userId,
      },
      select: { id: true, slug: true },
    });
    await tx.membership.create({
      data: { workspaceId: ws.id, userId, role: "OWNER" },
    });
    return ws;
  });
}

/**
 * Upgrade a workspace's Subscription to PRO. Tests that touch
 * plan-gated procedures (workspaces.invite, apiKeys.create,
 * webhooks.create, workflows.create) call this right after creating
 * the workspace so the gate doesn't fire. The plan-gating contract
 * test creates its own FREE workspaces explicitly.
 *
 * Accepts either an `id` or a `slug` — slug is convenient for tests
 * that don't capture the return value of `caller.workspaces.create`.
 */
export async function upgradeWorkspaceToPro(
  ref: { id: string } | { slug: string },
) {
  let workspaceId: string;
  if ("id" in ref) {
    workspaceId = ref.id;
  } else {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: ref.slug },
      select: { id: true },
    });
    workspaceId = ws.id;
  }
  await prisma.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, plan: "PRO", status: "ACTIVE" },
    update: { plan: "PRO", status: "ACTIVE" },
  });
}

/** Tomorrow at 10:00 UTC — always upcoming, always validates. */
export function tomorrowAt10UTC(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

/** A slot N minutes after `tomorrowAt10UTC` (in 15-min increments). */
export function tomorrowAtMinute(offsetMinutes: number): Date {
  const d = tomorrowAt10UTC();
  d.setUTCMinutes(d.getUTCMinutes() + offsetMinutes);
  return d;
}

/** Wipe per-test state — bookings, audit, tasks, webhook subs, features. */
export async function wipeTransientState(hostId?: string) {
  await prisma.bookingAudit.deleteMany({});
  await prisma.task.deleteMany({});
  if (hostId) {
    await prisma.booking.deleteMany({ where: { hostId } });
    await prisma.webhookSubscription.deleteMany({ where: { userId: hostId } });
    await prisma.userFeatures.deleteMany({ where: { userId: hostId } });
  } else {
    await prisma.booking.deleteMany({});
    await prisma.webhookSubscription.deleteMany({});
    await prisma.userFeatures.deleteMany({});
  }
  await prisma.feature.deleteMany({});
}

export async function tearDownTestHost(hostId: string) {
  await wipeTransientState(hostId);
  await prisma.user.deleteMany({ where: { id: hostId } });
  await prisma.$disconnect();
}

/**
 * Tear down a test host whose row may already be gone (e.g. the test
 * under test deleted it via `users.deleteAccount`). Same shape as
 * `tearDownTestHost` but resilient: locates the row by handle and
 * no-ops the user delete if it's missing. Still scrubs the global
 * transient tables (audit, tasks) so the row residue doesn't bleed
 * into the next test file.
 */
export async function safeTearDownByHandle(handle: string) {
  const existing = await prisma.user.findFirst({
    where: { handle },
    select: { id: true },
  });
  if (existing) {
    await wipeTransientState(existing.id);
    await prisma.user.deleteMany({ where: { id: existing.id } });
  } else {
    // Host already gone — only the global transient tables can carry
    // residue (BookingAudit has no FK; Task may have orphan rows).
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
  }
  await prisma.$disconnect();
}

export function fakeContext(overrides: Partial<{
  userId: string;
  ipIdentifier: string;
  cookies: Map<string, string>;
  activeWorkspaceSlug: string | null;
}> = {}) {
  return {
    user: overrides.userId ? { id: overrides.userId, email: "test@test.local" } : null,
    ipIdentifier: overrides.ipIdentifier ?? `test:${crypto.randomUUID()}`,
    cookies: overrides.cookies ?? new Map<string, string>(),
    activeWorkspaceSlug: overrides.activeWorkspaceSlug ?? null,
  };
}

// ─── Composable factories (A12) ──────────────────────────────────────
//
// `createTestHost` above bakes a full availability schedule because
// 90% of tests exercise the booking flow. These factories are for the
// remaining 10%: tests that need a User without availability, a
// Booking row pre-seeded outside the tRPC flow, a webhook subscription
// for a delivery test, or an audit row for a query/filter test.
// Pattern reference: rallly /apps/web/tests/test-utils.ts —
// createUserInDb / createSpaceInDb / createTestPoll shape.

/**
 * Lightweight user — no availability ranges. Use when a test needs a
 * principal (admin, second host, viewer) but doesn't book against
 * them. ~10x faster than createTestHost on per-row insert volume.
 */
export async function createTestUser(handle: string, opts?: {
  name?: string | null;
  timezone?: string;
}): Promise<{ id: string; handle: string; email: string }> {
  await prisma.user.deleteMany({ where: { handle } });
  const user = await prisma.user.create({
    data: {
      email: `vitest-${handle}-${Date.now()}@test.local`,
      handle,
      name: opts?.name ?? null,
      timezone: opts?.timezone ?? "UTC",
    },
    select: { id: true, handle: true, email: true },
  });
  return { id: user.id, handle: user.handle!, email: user.email };
}

/**
 * Insert a Booking row directly — bypasses tRPC validation, idempotency,
 * webhook fan-out. Useful for tests that need a pre-existing booking
 * without exercising the create flow (cleanup-cron retention, audit
 * inspection, listForHost ordering).
 *
 * `workspaceId` resolves to the host's oldest owned Workspace. Hosts
 * created via `createTestHost` already have one; users created via
 * `createTestUser` get one minted on demand here so callers never
 * have to plumb it through.
 */
export async function createTestBooking(opts: {
  hostId: string;
  slotStart: Date;
  visitorName?: string;
  visitorEmail?: string;
  question?: string | null;
  deleted?: boolean;
  deletedAt?: Date | null;
  visitorTimezone?: string | null;
  workspaceId?: string;
}): Promise<{ id: number; publicUid: string; slotStart: Date; slotEnd: Date }> {
  const slotEnd = new Date(opts.slotStart.getTime() + 15 * 60_000);
  let workspaceId = opts.workspaceId;
  if (!workspaceId) {
    const existing = await prisma.workspace.findFirst({
      where: { ownerId: opts.hostId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    workspaceId =
      existing?.id ??
      (await createTestWorkspaceForUser(opts.hostId)).id;
  }
  return prisma.booking.create({
    data: {
      hostId: opts.hostId,
      workspaceId,
      slotStart: opts.slotStart,
      slotEnd,
      visitorName: opts.visitorName ?? "Test Visitor",
      visitorEmail: opts.visitorEmail ?? "visitor@test.local",
      question: opts.question ?? null,
      deleted: opts.deleted ?? false,
      deletedAt: opts.deletedAt ?? null,
      visitorTimezone: opts.visitorTimezone ?? null,
    },
    select: {
      id: true,
      publicUid: true,
      slotStart: true,
      slotEnd: true,
    },
  });
}

/**
 * Insert a WebhookSubscription row directly for a user. The secret
 * field is set to a deterministic value — tests that need to verify
 * HMAC signatures can read it back to compute the expected signature.
 */
export async function createTestWebhookSubscription(opts: {
  userId: string;
  // Optional — defaults to the user's primary owned workspace. B1
  // made WebhookSubscription.workspaceId non-null; tests that don't
  // care which workspace the row sits in get the auto-resolved
  // primary, mirroring how the procedure resolves it via slug.
  workspaceId?: string;
  subscriberUrl?: string;
  events?: ReadonlyArray<string>;
  secret?: string;
  active?: boolean;
}): Promise<{
  id: number;
  publicUid: string;
  secret: string;
  subscriberUrl: string;
}> {
  let workspaceId = opts.workspaceId;
  if (!workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { ownerId: opts.userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!ws) {
      throw new Error(
        `createTestWebhookSubscription: user ${opts.userId} has no owned workspace; ` +
          `pass workspaceId explicitly or call createTestHost to seed one.`,
      );
    }
    workspaceId = ws.id;
  }
  return prisma.webhookSubscription.create({
    data: {
      userId: opts.userId,
      workspaceId,
      subscriberUrl: opts.subscriberUrl ?? "https://receiver.test/hook",
      events: (opts.events ?? ["booking.created"]).join(","),
      secret: opts.secret ?? "test-secret-".padEnd(64, "f"),
      active: opts.active ?? true,
    },
    select: {
      id: true,
      publicUid: true,
      secret: true,
      subscriberUrl: true,
    },
  });
}

/**
 * Insert a BookingAudit row directly. `bookingUid` is a plain string
 * (no FK), so a test can seed an audit row even for a booking that
 * was never created — useful for verifying the post-cleanup
 * "audit survives" invariant.
 */
export async function createTestBookingAudit(opts: {
  bookingUid: string;
  // B1 — workspaceId is required at the schema level. Resolved via
  // the audit's bookingUid → Booking.workspaceId when omitted, with
  // a defensive throw if the booking is gone (the audit-survives-
  // booking-deletion invariant means callers must pass workspaceId
  // explicitly when seeding orphan rows).
  workspaceId?: string;
  actor?: "VISITOR" | "HOST" | "SYSTEM";
  action: "CREATED" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED_FROM" | "RESCHEDULED_TO";
  data?: Record<string, unknown>;
  operationId?: string;
  createdAt?: Date;
}): Promise<{ id: number; bookingUid: string; operationId: string }> {
  let workspaceId = opts.workspaceId;
  if (!workspaceId) {
    const booking = await prisma.booking.findUnique({
      where: { publicUid: opts.bookingUid },
      select: { workspaceId: true },
    });
    if (!booking) {
      throw new Error(
        `createTestBookingAudit: bookingUid ${opts.bookingUid} not found; ` +
          `pass workspaceId explicitly to seed an orphan audit row.`,
      );
    }
    workspaceId = booking.workspaceId;
  }
  return prisma.bookingAudit.create({
    data: {
      bookingUid: opts.bookingUid,
      workspaceId,
      actor: opts.actor ?? "VISITOR",
      action: opts.action,
      // Prisma's JsonValue input type rejects `Record<string, unknown>`
      // even when the values would round-trip cleanly — cast through
      // its alias for the same shape we already document.
      data: (opts.data ?? {}) as Prisma.InputJsonValue,
      operationId: opts.operationId ?? crypto.randomUUID(),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true, bookingUid: true, operationId: true },
  });
}

/**
 * Delete every Invitation + Membership + Workspace row matching the
 * given slugs. Used by the workspaces.* contract tests so each one
 * starts from a clean slate without bleeding into the next file's
 * fixtures (no FK from Invitation → Membership, so the order matters).
 */
export async function purgeTestWorkspaces(slugs: ReadonlyArray<string>) {
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

/**
 * Mint an EventType + EventTypeHost pool on the host's primary owned
 * workspace. `createTestHost` seeds a singleton host (no EventType),
 * so round-robin / multi-host tests have to attach the pool members
 * by hand. This factory is the canonical way to do that.
 *
 * Usage (from round-robin-integration.test.ts):
 *
 *   const { eventTypeId } = await createTestEventTypeHostPool({
 *     hostHandle: host.handle,
 *     members: [
 *       { userId: host.id },           // primary host
 *       { userId: secondHost.id },     // pool member
 *     ],
 *   });
 *
 * Defaults match the most common shape: `isFixed: false` (round-robin
 * pool member, not a singleton), `priority: 2`, `weight: 1`,
 * `recentAssignments: 0`. Override per-member to test priority /
 * weight / tiebreak edge cases.
 */
export async function createTestEventTypeHostPool(opts: {
  hostHandle: string;
  slug?: string;
  durationMins?: number;
  members: ReadonlyArray<{
    userId: string;
    isFixed?: boolean;
    priority?: number;
    weight?: number;
    recentAssignments?: number;
  }>;
}): Promise<{ eventTypeId: string; workspaceId: string }> {
  const host = await prisma.user.findUniqueOrThrow({
    where: { handle: opts.hostHandle },
    select: {
      id: true,
      ownedWorkspaces: {
        select: { id: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const workspaceId = host.ownedWorkspaces[0]?.id;
  if (!workspaceId) {
    throw new Error(
      `createTestEventTypeHostPool: host ${opts.hostHandle} has no owned ` +
        `workspace; call createTestHost first.`,
    );
  }

  const slug = opts.slug ?? opts.hostHandle;
  const durationMins = opts.durationMins ?? 15;
  const eventType = await prisma.eventType.upsert({
    where: { workspaceId_slug: { workspaceId, slug } },
    create: {
      workspaceId,
      slug,
      name: slug,
      durationMins,
      // B.PT278 — fixture seeds the list with the singleton default
      // so tests start from the same on-disk shape that bootstrap
      // (setHandle) writes for new hosts.
      durationMinsList: JSON.stringify([durationMins]),
    },
    update: {},
    select: { id: true },
  });

  for (const m of opts.members) {
    await prisma.eventTypeHost.upsert({
      where: {
        eventTypeId_userId: { eventTypeId: eventType.id, userId: m.userId },
      },
      create: {
        eventTypeId: eventType.id,
        userId: m.userId,
        isFixed: m.isFixed ?? false,
        priority: m.priority ?? 2,
        weight: m.weight ?? 1,
        recentAssignments: m.recentAssignments ?? 0,
      },
      update: {
        isFixed: m.isFixed ?? false,
        priority: m.priority ?? 2,
        weight: m.weight ?? 1,
        recentAssignments: m.recentAssignments ?? 0,
      },
    });
  }

  return { eventTypeId: eventType.id, workspaceId };
}
