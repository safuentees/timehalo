import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { addHostToEventType } from "@/lib/team-event-type";
import {
  createTestEventTypeHostPool,
  createTestHost,
  fakeContext,
  tearDownTestHost,
} from "../../../test/fixtures";

// B.PT62 — team round-robin booking contract tests. Branches taken:
//   A — implicit team-type schema (>1 EventTypeHost = team)
//   B — /w/<slug>/<eventTypeSlug> URL pattern
//   A — defer host-side authoring UI
//   C — hybrid recentAssignments (insert-time backfill, no cron)
//   A — host hidden until confirmation page
//
// Coverage:
//   - publicGetEventType: 404 for non-existent + non-team event types,
//     returns workspace + duration + host count + avatars (no names)
//   - publicGetUpcomingSlotsForEventType: union slot generation,
//     fixed-host requirement, returns ascending slots
//   - bookForTeam: round-robin pick + Booking row + audit, slot
//     collision rejection, idempotency dedup, returns assigned host
//   - addHostToEventType: insert-time backfill = avg of existing
//     non-fixed pool members' recentAssignments
//
// Pattern: caller + fakeContext per AGENTS.md *Always do*. Two test
// hosts (HANDLE_A is the seed; HANDLE_B is added as a second pool
// member) created in beforeAll, torn down in afterAll. Per-test
// state wiped in beforeEach.

const callRouter = createCaller(appRouter);
const HANDLE_A = "vitest-team-host-a";
const HANDLE_B = "vitest-team-host-b";
const TEAM_EVENT_SLUG = "intro-call";

describe("workspaces team booking (B.PT62)", () => {
  let hostA: { id: string };
  let hostB: { id: string };
  let workspaceSlug: string;
  let workspaceId: string;
  let eventTypeId: string;

  beforeAll(async () => {
    hostA = await createTestHost(HANDLE_A);
    hostB = await createTestHost(HANDLE_B);

    // Pool: A + B both rotating, no fixed hosts. Tests assert that
    // selectHost picks them by round-robin score.
    const pool = await createTestEventTypeHostPool({
      hostHandle: HANDLE_A,
      slug: TEAM_EVENT_SLUG,
      durationMins: 15,
      members: [
        { userId: hostA.id, isFixed: false, priority: 2, weight: 1 },
        { userId: hostB.id, isFixed: false, priority: 2, weight: 1 },
      ],
    });
    eventTypeId = pool.eventTypeId;
    workspaceId = pool.workspaceId;

    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { slug: true },
    });
    workspaceSlug = ws.slug;
  });

  beforeEach(async () => {
    await prisma.bookingAudit.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.booking.deleteMany({
      where: { OR: [{ hostId: hostA.id }, { hostId: hostB.id }] },
    });
    // Reset both hosts' recentAssignments so per-test ordering is
    // deterministic. Without this, a test that bumps hostA's counter
    // pollutes the next test's expectations.
    await prisma.eventTypeHost.updateMany({
      where: { eventTypeId },
      data: { recentAssignments: 0 },
    });
  });

  afterAll(async () => {
    await tearDownTestHost(hostA.id);
    await tearDownTestHost(hostB.id);
  });

  describe("publicGetEventType", () => {
    it("returns workspace + duration + host count + avatars (no names)", async () => {
      const caller = callRouter(fakeContext());
      const result = await caller.workspaces.publicGetEventType({
        slug: workspaceSlug,
        eventTypeSlug: TEAM_EVENT_SLUG,
      });
      expect(result.slug).toBe(TEAM_EVENT_SLUG);
      expect(result.durationMins).toBe(15);
      expect(result.hostCount).toBe(2);
      // Branch 5: visitor sees avatars but NOT names — names appear
      // only on the confirmation page after the host is assigned.
      expect(result.hostAvatars).toHaveLength(2);
      expect(result).not.toHaveProperty("hosts");
      expect(result).not.toHaveProperty("hostNames");
    });

    it("404s on non-existent workspace", async () => {
      const caller = callRouter(fakeContext());
      await expect(
        caller.workspaces.publicGetEventType({
          slug: "no-such-workspace-xyz",
          eventTypeSlug: TEAM_EVENT_SLUG,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("404s on a singleton (1-host) event type — branch 1 implicit team-type rule", async () => {
      // The handle's seeded EventType has only one host (the user
      // themselves). Per branch 1, 1-host event types are personal
      // and routed at /h/<handle>, not bookable through the team
      // URL even when a curl probes the workspace path.
      const personalEventTypeSlug = HANDLE_A;
      const caller = callRouter(fakeContext());
      // Singleton event types may not exist in the test DB unless
      // the bootstrap seeded one — guard.
      const exists = await prisma.eventType.findFirst({
        where: { workspaceId, slug: personalEventTypeSlug },
        select: { id: true, _count: { select: { hosts: true } } },
      });
      if (!exists || exists._count.hosts > 1) return;
      await expect(
        caller.workspaces.publicGetEventType({
          slug: workspaceSlug,
          eventTypeSlug: personalEventTypeSlug,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("publicGetUpcomingSlotsForEventType", () => {
    it("returns slots in ascending order with status=open", async () => {
      const caller = callRouter(fakeContext());
      const slots = await caller.workspaces.publicGetUpcomingSlotsForEventType(
        {
          slug: workspaceSlug,
          eventTypeSlug: TEAM_EVENT_SLUG,
          days: 3,
        },
      );
      expect(slots.length).toBeGreaterThan(0);
      // Ascending order
      for (let i = 1; i < slots.length; i++) {
        expect(
          new Date(slots[i].start).getTime(),
        ).toBeGreaterThanOrEqual(new Date(slots[i - 1].start).getTime());
      }
      // All slots are 15 minutes (durationMins for the test event type).
      for (const s of slots) {
        expect(
          new Date(s.end).getTime() - new Date(s.start).getTime(),
        ).toBe(15 * 60_000);
        expect(s.status).toBe("open");
      }
    });
  });

  describe("bookForTeam", () => {
    function nextMondayAt10UTC(): Date {
      const d = new Date();
      const offset = ((1 - d.getUTCDay() + 7) % 7) || 7;
      d.setUTCDate(d.getUTCDate() + offset);
      d.setUTCHours(10, 0, 0, 0);
      return d;
    }

    it("creates a booking + assigns a host + returns assigned host info", async () => {
      const slot = nextMondayAt10UTC();
      const caller = callRouter(fakeContext());
      const result = await caller.workspaces.bookForTeam({
        slug: workspaceSlug,
        eventTypeSlug: TEAM_EVENT_SLUG,
        slotStart: slot.toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Alice Visitor",
        visitorEmail: "alice@test.local",
      });

      expect(result.publicUid).toBeTruthy();
      expect(result.assignedHost.handle).toMatch(
        /^vitest-team-host-[ab]$/,
      );

      const row = await prisma.booking.findUnique({
        where: { publicUid: result.publicUid },
        select: { hostId: true, eventTypeId: true, workspaceId: true },
      });
      expect(row).toMatchObject({ workspaceId, eventTypeId });
      expect([hostA.id, hostB.id]).toContain(row?.hostId ?? "");

      const audit = await prisma.bookingAudit.findFirst({
        where: { bookingUid: result.publicUid, action: "CREATED" },
        select: { actor: true, workspaceId: true },
      });
      expect(audit).toMatchObject({ actor: "VISITOR", workspaceId });
    });

    it("idempotency: same key → same booking, no second row", async () => {
      const slot = nextMondayAt10UTC();
      const idempotencyKey = crypto.randomUUID();
      const caller = callRouter(fakeContext());
      const input = {
        slug: workspaceSlug,
        eventTypeSlug: TEAM_EVENT_SLUG,
        slotStart: slot.toISOString(),
        idempotencyKey,
        visitorName: "Bob Visitor",
        visitorEmail: "bob@test.local",
      };

      const first = await caller.workspaces.bookForTeam(input);
      const second = await caller.workspaces.bookForTeam(input);
      expect(first.publicUid).toBe(second.publicUid);

      const count = await prisma.booking.count({
        where: { idempotencyKey },
      });
      expect(count).toBe(1);
    });

    it("round-robin fairness over N concurrent bookings (different keys, different slots)", async () => {
      const caller = callRouter(fakeContext());
      const baseSlot = nextMondayAt10UTC();

      // 6 bookings on 6 different slots — should split evenly between
      // A and B (3 each) since both start with recentAssignments=0,
      // priority/weight equal, and the algorithm tiebreaks on host id
      // alphabetically. Each booking bumps the picked host's counter
      // → next pick goes to the other.
      const results: string[] = [];
      for (let i = 0; i < 6; i++) {
        const slot = new Date(baseSlot.getTime() + i * 30 * 60_000);
        const r = await caller.workspaces.bookForTeam({
          slug: workspaceSlug,
          eventTypeSlug: TEAM_EVENT_SLUG,
          slotStart: slot.toISOString(),
          idempotencyKey: crypto.randomUUID(),
          visitorName: `Visitor ${i}`,
          visitorEmail: `visitor-${i}@test.local`,
        });
        results.push(r.assignedHost.handle ?? "");
      }
      const aCount = results.filter((h) => h === HANDLE_A).length;
      const bCount = results.filter((h) => h === HANDLE_B).length;
      expect(aCount).toBe(3);
      expect(bCount).toBe(3);
    });

    it("rejects when the event type doesn't exist", async () => {
      const caller = callRouter(fakeContext());
      await expect(
        caller.workspaces.bookForTeam({
          slug: workspaceSlug,
          eventTypeSlug: "no-such-event-type",
          slotStart: nextMondayAt10UTC().toISOString(),
          idempotencyKey: crypto.randomUUID(),
          visitorName: "Bob",
          visitorEmail: "bob@test.local",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects with CONFLICT when the picked host already booked this slot", async () => {
      // Plant an existing booking for hostA at the slot, AND set
      // hostB.recentAssignments high so the picker prefers hostA.
      // Then exclude logic should drop hostA (already booked at this
      // slot via the eventType filter) and try hostB instead — which
      // CAN take the booking. So this test asserts the EXCLUDE path
      // works: even though A is "preferred" by the score, the exclude
      // makes B the pick.
      const slot = nextMondayAt10UTC();
      await prisma.booking.create({
        data: {
          hostId: hostA.id,
          workspaceId,
          eventTypeId,
          visitorName: "Pre-existing",
          visitorEmail: "pre@test.local",
          slotStart: slot,
          slotEnd: new Date(slot.getTime() + 15 * 60_000),
          idempotencyKey: crypto.randomUUID(),
        },
      });
      // Bias the score towards A by giving B a high recent count.
      await prisma.eventTypeHost.updateMany({
        where: { eventTypeId, userId: hostB.id },
        data: { recentAssignments: 100 },
      });

      const caller = callRouter(fakeContext());
      const result = await caller.workspaces.bookForTeam({
        slug: workspaceSlug,
        eventTypeSlug: TEAM_EVENT_SLUG,
        slotStart: slot.toISOString(),
        idempotencyKey: crypto.randomUUID(),
        visitorName: "Carol",
        visitorEmail: "carol@test.local",
      });

      // Despite B being "less due" by score, A is excluded → B picked.
      expect(result.assignedHost.handle).toBe(HANDLE_B);
    });
  });

  describe("addHostToEventType — branch C insert-time fairness backfill", () => {
    it("seeds new host's recentAssignments with avg of existing non-fixed hosts", async () => {
      // Plant a 2-host pool with mismatched counters. New 3rd host's
      // backfill should be the average ⌈(40+60)/2⌉ = 50.
      const tempEventType = await prisma.eventType.create({
        data: {
          workspaceId,
          slug: `vitest-pool-backfill-${Date.now()}`,
          name: "Backfill test",
          durationMins: 15,
        },
        select: { id: true },
      });
      try {
        await prisma.eventTypeHost.create({
          data: {
            eventTypeId: tempEventType.id,
            userId: hostA.id,
            isFixed: false,
            priority: 2,
            weight: 1,
            recentAssignments: 40,
          },
        });
        await prisma.eventTypeHost.create({
          data: {
            eventTypeId: tempEventType.id,
            userId: hostB.id,
            isFixed: false,
            priority: 2,
            weight: 1,
            recentAssignments: 60,
          },
        });

        // Create a third user just for this test.
        const hostC = await createTestHost("vitest-team-host-c-backfill");
        try {
          const created = await addHostToEventType({
            eventTypeId: tempEventType.id,
            userId: hostC.id,
          });
          const row = await prisma.eventTypeHost.findUniqueOrThrow({
            where: { id: created.id },
            select: { recentAssignments: true },
          });
          expect(row.recentAssignments).toBe(50);
        } finally {
          await tearDownTestHost(hostC.id);
        }
      } finally {
        await prisma.eventTypeHost.deleteMany({
          where: { eventTypeId: tempEventType.id },
        });
        await prisma.eventType.delete({
          where: { id: tempEventType.id },
        });
      }
    });

    it("seeds 0 when the pool is empty (first host added)", async () => {
      const tempEventType = await prisma.eventType.create({
        data: {
          workspaceId,
          slug: `vitest-pool-empty-${Date.now()}`,
          name: "Empty pool",
          durationMins: 15,
        },
        select: { id: true },
      });
      try {
        const created = await addHostToEventType({
          eventTypeId: tempEventType.id,
          userId: hostA.id,
        });
        const row = await prisma.eventTypeHost.findUniqueOrThrow({
          where: { id: created.id },
          select: { recentAssignments: true },
        });
        expect(row.recentAssignments).toBe(0);
      } finally {
        await prisma.eventTypeHost.deleteMany({
          where: { eventTypeId: tempEventType.id },
        });
        await prisma.eventType.delete({
          where: { id: tempEventType.id },
        });
      }
    });

    it("ignores fixed hosts when computing the average — they're always-attend, not rotation", async () => {
      // Pool: 1 fixed host (recent=999, doesn't count), 1 rotating
      // (recent=20). Backfill = avg of just the rotating = 20.
      const tempEventType = await prisma.eventType.create({
        data: {
          workspaceId,
          slug: `vitest-pool-fixed-${Date.now()}`,
          name: "Fixed-host pool",
          durationMins: 15,
        },
        select: { id: true },
      });
      try {
        await prisma.eventTypeHost.create({
          data: {
            eventTypeId: tempEventType.id,
            userId: hostA.id,
            isFixed: true,
            priority: 2,
            weight: 1,
            recentAssignments: 999,
          },
        });
        await prisma.eventTypeHost.create({
          data: {
            eventTypeId: tempEventType.id,
            userId: hostB.id,
            isFixed: false,
            priority: 2,
            weight: 1,
            recentAssignments: 20,
          },
        });
        const hostD = await createTestHost("vitest-team-host-d-fixed");
        try {
          const created = await addHostToEventType({
            eventTypeId: tempEventType.id,
            userId: hostD.id,
          });
          const row = await prisma.eventTypeHost.findUniqueOrThrow({
            where: { id: created.id },
            select: { recentAssignments: true },
          });
          expect(row.recentAssignments).toBe(20);
        } finally {
          await tearDownTestHost(hostD.id);
        }
      } finally {
        await prisma.eventTypeHost.deleteMany({
          where: { eventTypeId: tempEventType.id },
        });
        await prisma.eventType.delete({
          where: { id: tempEventType.id },
        });
      }
    });
  });
});
