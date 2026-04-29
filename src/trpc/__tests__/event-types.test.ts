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
} from "../../../test/fixtures";

// B4 — workspace event-type management procedure contracts.
// Coverage:
//   • CRUD: list / create / update / delete event types (workspace
//     scope + slug uniqueness gate).
//   • Host pool: addHost / updateHost / removeHost (workspace
//     membership requirement, isFixed/priority/weight semantics).
//   • Permission gates: NOT_FOUND for non-members, FORBIDDEN for
//     read-only roles trying to write.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-eventtypes";

describe("eventTypes (B4)", () => {
  let owner: { id: string; handle: string };
  let workspaceId: string;

  beforeAll(async () => {
    owner = await createTestHost(HANDLE);
    const ws = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: owner.id },
      select: { id: true },
    });
    workspaceId = ws.id;
  });
  beforeEach(async () => {
    // Clear all event types EXCEPT the singleton seeded by
    // createTestHost (slug=handle). Keep the seeded one so the
    // bookings flow has its host pool intact for unrelated tests.
    await prisma.eventType.deleteMany({
      where: { workspaceId, slug: { not: HANDLE } },
    });
  });
  afterAll(async () => {
    await tearDownTestHost(owner.id);
  });

  describe("create / list / update / delete", () => {
    it("create returns the row + list surfaces it", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.eventTypes.create({
        slug: HANDLE,
        eventTypeSlug: "consult-30",
        name: "30-min consult",
        durationMins: 30,
      });
      expect(created.slug).toBe("consult-30");

      const list = await caller.eventTypes.list({ slug: HANDLE });
      expect(list.some((et) => et.id === created.id)).toBe(true);
    });

    it("create rejects duplicate slug with CONFLICT", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await caller.eventTypes.create({
        slug: HANDLE,
        eventTypeSlug: "dup",
        name: "First",
      });
      await expect(
        caller.eventTypes.create({
          slug: HANDLE,
          eventTypeSlug: "dup",
          name: "Second",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("update changes name + duration", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.eventTypes.create({
        slug: HANDLE,
        eventTypeSlug: "to-update",
        name: "Old name",
      });
      await caller.eventTypes.update({
        slug: HANDLE,
        eventTypeId: created.id,
        name: "New name",
        durationMins: 45,
      });
      const list = await caller.eventTypes.list({ slug: HANDLE });
      const after = list.find((et) => et.id === created.id);
      expect(after?.name).toBe("New name");
      expect(after?.durationMins).toBe(45);
    });

    it("delete removes the row + cascades hosts but preserves bookings (eventTypeId nulled)", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.eventTypes.create({
        slug: HANDLE,
        eventTypeSlug: "to-delete",
        name: "Doomed",
      });
      await caller.eventTypes.addHost({
        slug: HANDLE,
        eventTypeId: created.id,
        userId: owner.id,
      });
      await caller.eventTypes.delete({
        slug: HANDLE,
        eventTypeId: created.id,
      });
      const list = await caller.eventTypes.list({ slug: HANDLE });
      expect(list.some((et) => et.id === created.id)).toBe(false);
      // EventTypeHost cascade-deleted with the parent.
      const hosts = await prisma.eventTypeHost.count({
        where: { eventTypeId: created.id },
      });
      expect(hosts).toBe(0);
    });

    it("non-member can't list — NOT_FOUND", async () => {
      const stranger = await createTestUser("vitest-eventtypes-stranger");
      try {
        const strangerCaller = callRouter(
          fakeContext({ userId: stranger.id }),
        );
        await expect(
          strangerCaller.eventTypes.list({ slug: HANDLE }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });

    it("MEMBER role can read but not write — FORBIDDEN on create", async () => {
      const member = await createTestUser("vitest-eventtypes-member");
      try {
        await prisma.membership.create({
          data: { workspaceId, userId: member.id, role: "MEMBER" },
        });
        const memberCaller = callRouter(
          fakeContext({ userId: member.id }),
        );
        // Read OK
        await memberCaller.eventTypes.list({ slug: HANDLE });
        // Write FORBIDDEN
        await expect(
          memberCaller.eventTypes.create({
            slug: HANDLE,
            eventTypeSlug: "by-member",
            name: "Should fail",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await tearDownTestHost(member.id);
      }
    });
  });

  describe("host pool", () => {
    let eventTypeId: string;

    beforeEach(async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      const created = await caller.eventTypes.create({
        slug: HANDLE,
        eventTypeSlug: "pool-tests",
        name: "Pool tests",
      });
      eventTypeId = created.id;
    });

    it("addHost requires the user to be a workspace member", async () => {
      const stranger = await createTestUser("vitest-eventtypes-pool-stranger");
      try {
        const caller = callRouter(fakeContext({ userId: owner.id }));
        await expect(
          caller.eventTypes.addHost({
            slug: HANDLE,
            eventTypeId,
            userId: stranger.id,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await tearDownTestHost(stranger.id);
      }
    });

    it("addHost rejects duplicate (eventTypeId, userId) with CONFLICT", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await caller.eventTypes.addHost({
        slug: HANDLE,
        eventTypeId,
        userId: owner.id,
      });
      await expect(
        caller.eventTypes.addHost({
          slug: HANDLE,
          eventTypeId,
          userId: owner.id,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("updateHost changes isFixed / priority / weight", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await caller.eventTypes.addHost({
        slug: HANDLE,
        eventTypeId,
        userId: owner.id,
      });
      await caller.eventTypes.updateHost({
        slug: HANDLE,
        eventTypeId,
        userId: owner.id,
        isFixed: true,
        priority: 4,
        weight: 5,
      });
      const hosts = await caller.eventTypes.listHosts({
        slug: HANDLE,
        eventTypeId,
      });
      const me = hosts.find((h) => h.user.id === owner.id);
      expect(me?.isFixed).toBe(true);
      expect(me?.priority).toBe(4);
      expect(me?.weight).toBe(5);
    });

    it("removeHost deletes the row", async () => {
      const caller = callRouter(fakeContext({ userId: owner.id }));
      await caller.eventTypes.addHost({
        slug: HANDLE,
        eventTypeId,
        userId: owner.id,
      });
      await caller.eventTypes.removeHost({
        slug: HANDLE,
        eventTypeId,
        userId: owner.id,
      });
      const hosts = await caller.eventTypes.listHosts({
        slug: HANDLE,
        eventTypeId,
      });
      expect(hosts.some((h) => h.user.id === owner.id)).toBe(false);
    });
  });
});
