import { prisma } from "@/lib/prisma";

// Shared test fixtures. Each test file calls these in beforeAll to
// seed a host with availability that makes any 15-min slot validate
// against generateUpcomingSlots. The hostHandle is parameterized so
// parallel test files don't collide on the global @unique handle.

export type TestHost = { id: string; handle: string; email: string };

export async function createTestHost(handle: string): Promise<TestHost> {
  await prisma.user.deleteMany({ where: { handle } });
  const host = await prisma.user.create({
    data: {
      email: `vitest-${handle}-${Date.now()}@test.local`,
      handle,
      availabilityRanges: {
        create: [
          // Every weekday 0:00–23:45 — covers any test that picks an
          // upcoming slot regardless of what day it is.
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
  return { id: host.id, handle: host.handle!, email: host.email };
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
