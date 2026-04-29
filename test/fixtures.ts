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

export async function safeTearDownByHandle(handle: string) {
  const existing = await prisma.user.findFirst({
    where: { handle },
    select: { id: true },
  });
  if (existing) {
    await wipeTransientState(existing.id);
    await prisma.user.deleteMany({ where: { id: existing.id } });
  } else {
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

export async function createTestBookingAudit(opts: {
  bookingUid: string;
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
      data: (opts.data ?? {}) as Prisma.InputJsonValue,
      operationId: opts.operationId ?? crypto.randomUUID(),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true, bookingUid: true, operationId: true },
  });
}

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
  const eventType = await prisma.eventType.upsert({
    where: { workspaceId_slug: { workspaceId, slug } },
    create: {
      workspaceId,
      slug,
      name: slug,
      durationMins: opts.durationMins ?? 15,
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
