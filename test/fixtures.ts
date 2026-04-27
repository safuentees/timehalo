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

export function fakeContext(overrides: Partial<{
  userId: string;
  ipIdentifier: string;
  cookies: Map<string, string>;
}> = {}) {
  return {
    user: overrides.userId ? { id: overrides.userId, email: "test@test.local" } : null,
    ipIdentifier: overrides.ipIdentifier ?? `test:${crypto.randomUUID()}`,
    cookies: overrides.cookies ?? new Map<string, string>(),
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
  return prisma.webhookSubscription.create({
    data: {
      userId: opts.userId,
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
  actor?: "VISITOR" | "HOST" | "SYSTEM";
  action: "CREATED" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED_FROM" | "RESCHEDULED_TO";
  data?: Record<string, unknown>;
  operationId?: string;
  createdAt?: Date;
}): Promise<{ id: number; bookingUid: string; operationId: string }> {
  return prisma.bookingAudit.create({
    data: {
      bookingUid: opts.bookingUid,
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
