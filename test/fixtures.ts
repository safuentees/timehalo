import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type TestHost = { id: string; handle: string; email: string };

export async function createTestHost(handle: string): Promise<TestHost> {
  await prisma.user.deleteMany({ where: { handle } });
  const host = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: `vitest-${handle}-${Date.now()}@test.local`,
        handle,
        availabilityRanges: {
          create: [
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

export function tomorrowAt10UTC(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

export function tomorrowAtMinute(offsetMinutes: number): Date {
  const d = tomorrowAt10UTC();
  d.setUTCMinutes(d.getUTCMinutes() + offsetMinutes);
  return d;
}

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
      data: (opts.data ?? {}) as Prisma.InputJsonValue,
      operationId: opts.operationId ?? crypto.randomUUID(),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true, bookingUid: true, operationId: true },
  });
}
