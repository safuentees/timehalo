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
  tearDownTestHost,
  tomorrowAtMinute,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-audit";

describe("audit.listForWorkspace (B1)", () => {
  let host: { id: string; handle: string };
  let workspaceId: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    const ws = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: host.id },
      select: { id: true },
    });
    workspaceId = ws.id;
  });
  beforeEach(async () => {
    await prisma.bookingAudit.deleteMany({ where: { workspaceId } });
    await prisma.booking.deleteMany({ where: { hostId: host.id } });
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("returns the workspace's audit rows in id-desc order with no cursor", async () => {
    const visitorCaller = callRouter(fakeContext());
    for (let i = 0; i < 3; i++) {
      await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(i * 15).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: `V${i}`,
        visitorEmail: `v${i}@test.local`,
      });
    }

    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const result = await ownerCaller.audit.listForWorkspace({
      slug: HANDLE,
    });
    expect(result.items.length).toBe(3);
    expect(result.items[0].id).toBeGreaterThan(result.items[1].id);
    expect(result.items.every((r) => r.action === "CREATED")).toBe(true);
    expect(result.nextCursor).toBeNull();
  });

  it("paginates via nextCursor when there are more rows than limit", async () => {
    const visitorCaller = callRouter(fakeContext());
    for (let i = 0; i < 5; i++) {
      await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(i * 15).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: `V${i}`,
        visitorEmail: `v${i}@test.local`,
      });
    }

    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const page1 = await ownerCaller.audit.listForWorkspace({
      slug: HANDLE,
      limit: 2,
    });
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await ownerCaller.audit.listForWorkspace({
      slug: HANDLE,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBe(2);
    const ids1 = new Set(page1.items.map((r) => r.id));
    expect(page2.items.every((r) => !ids1.has(r.id))).toBe(true);
  });

  it("throws NOT_FOUND when caller isn't a member of the workspace", async () => {
    const stranger = await createTestUser("vitest-audit-stranger");
    try {
      const strangerCaller = callRouter(
        fakeContext({ userId: stranger.id }),
      );
      await expect(
        strangerCaller.audit.listForWorkspace({ slug: HANDLE }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await tearDownTestHost(stranger.id);
    }
  });

  it("throws FORBIDDEN for MEMBER role (workspace.write required)", async () => {
    const memberUser = await createTestUser("vitest-audit-member");
    try {
      await prisma.membership.create({
        data: {
          workspaceId,
          userId: memberUser.id,
          role: "MEMBER",
        },
      });
      const memberCaller = callRouter(
        fakeContext({ userId: memberUser.id }),
      );
      await expect(
        memberCaller.audit.listForWorkspace({ slug: HANDLE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await tearDownTestHost(memberUser.id);
    }
  });

  it("scopes results to the requested workspace (cross-workspace isolation)", async () => {
    const otherHost = await createTestHost("vitest-audit-other");
    try {
      const visitorCaller = callRouter(fakeContext());
      await visitorCaller.bookings.create({
        handle: HANDLE,
        slotStart: tomorrowAtMinute(0).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Maya",
        visitorEmail: "maya@test.local",
      });
      await visitorCaller.bookings.create({
        handle: otherHost.handle,
        slotStart: tomorrowAtMinute(15).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Bea",
        visitorEmail: "bea@test.local",
      });

      const ownerCaller = callRouter(fakeContext({ userId: host.id }));
      const otherCaller = callRouter(
        fakeContext({ userId: otherHost.id }),
      );

      const ownList = await ownerCaller.audit.listForWorkspace({
        slug: HANDLE,
      });
      const otherList = await otherCaller.audit.listForWorkspace({
        slug: otherHost.handle,
      });

      expect(ownList.items.length).toBe(1);
      expect(otherList.items.length).toBe(1);
      expect(ownList.items[0].bookingUid).not.toBe(
        otherList.items[0].bookingUid,
      );
    } finally {
      const otherBookings = await prisma.booking.findMany({
        where: { hostId: otherHost.id },
        select: { publicUid: true },
      });
      await prisma.bookingAudit.deleteMany({
        where: { bookingUid: { in: otherBookings.map((b) => b.publicUid) } },
      });
      await tearDownTestHost(otherHost.id);
    }
  });
});
