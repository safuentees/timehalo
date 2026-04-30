import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  createTestBooking,
  createTestWorkspaceForUser,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

// B.PT16 — `bookings.listForHost` is scoped to the active workspace.
// The host owns multiple workspaces (the default "Personal" plus a
// "Side" workspace minted in beforeAll); each workspace gets a
// distinct booking, and `listForHost` returns only the active one.
//
// Falls back to the oldest membership when the cookie-derived slug
// is null or points at a workspace the host is no longer a member of
// — mirrors the `effectiveSlug` invariant in `workspaces.list`.

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-list-for-host";

describe("bookings.listForHost — workspace scope (B.PT16)", () => {
  let host: { id: string; handle: string };
  let primaryWorkspaceId: string;
  let primaryWorkspaceSlug: string;
  let sideWorkspaceId: string;
  let sideWorkspaceSlug: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    // createTestHost mints the primary "Personal" workspace at
    // user create time. Look it up so we have its slug + id.
    const primary = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: host.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true },
    });
    primaryWorkspaceId = primary.id;
    primaryWorkspaceSlug = primary.slug;

    // Mint a second workspace owned by the same host. Membership +
    // OWNER role get seeded inside the fixture's transaction.
    const side = await createTestWorkspaceForUser(
      host.id,
      `${HANDLE}-side`,
    );
    sideWorkspaceId = side.id;
    sideWorkspaceSlug = side.slug;
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
  });

  afterAll(async () => {
    // Hand-roll the side-workspace teardown — `tearDownTestHost`
    // only cascades through the user delete, but the side
    // workspace's ownership FK is on the user so SQLite via
    // libsql will release it; explicitly delete the membership
    // first to keep the test DB tidy regardless of cascade behavior.
    await prisma.membership.deleteMany({ where: { workspaceId: sideWorkspaceId } });
    await prisma.workspace.deleteMany({ where: { id: sideWorkspaceId } });
    await tearDownTestHost(host.id);
  });

  it("returns only bookings in the active workspace (cookie set to side)", async () => {
    // Two bookings, one in each workspace, distinct slot times.
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryGuest",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(15),
      visitorName: "SideGuest",
    });

    const caller = callRouter(
      fakeContext({ userId: host.id, activeWorkspaceSlug: sideWorkspaceSlug }),
    );
    const { upcoming } = await caller.bookings.listForHost();

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.visitorName).toBe("SideGuest");
  });

  it("returns only bookings in the active workspace (cookie set to primary)", async () => {
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryGuest",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(15),
      visitorName: "SideGuest",
    });

    const caller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: primaryWorkspaceSlug,
      }),
    );
    const { upcoming } = await caller.bookings.listForHost();

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.visitorName).toBe("PrimaryGuest");
  });

  it("falls back to oldest membership when cookie unset", async () => {
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryGuest",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(15),
      visitorName: "SideGuest",
    });

    const caller = callRouter(
      // No `activeWorkspaceSlug` override → fakeContext supplies null.
      fakeContext({ userId: host.id }),
    );
    const { upcoming } = await caller.bookings.listForHost();

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.visitorName).toBe("PrimaryGuest");
  });

  it("falls back to oldest membership when cookie points at a non-member workspace", async () => {
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryGuest",
    });

    const caller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: "some-workspace-the-host-is-not-in",
      }),
    );
    const { upcoming } = await caller.bookings.listForHost();

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.visitorName).toBe("PrimaryGuest");
  });

  it("returns 0 bookings when the active workspace has none", async () => {
    // Only the primary workspace gets a booking; switch the active
    // workspace to the empty side and confirm the list is empty.
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryGuest",
    });

    const caller = callRouter(
      fakeContext({ userId: host.id, activeWorkspaceSlug: sideWorkspaceSlug }),
    );
    const { upcoming, past } = await caller.bookings.listForHost();

    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
  });

  it("filters past bookings by workspace too", async () => {
    // Past slot in primary; future slot in side. Active = side →
    // we should see neither in `past`. Active = primary → past
    // should hold the primary row.
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: new Date(Date.now() - 60 * 60 * 1000),
      visitorName: "PrimaryHistoric",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "SideUpcoming",
    });

    const sideCaller = callRouter(
      fakeContext({ userId: host.id, activeWorkspaceSlug: sideWorkspaceSlug }),
    );
    const { upcoming: sideUpcoming, past: sidePast } =
      await sideCaller.bookings.listForHost();
    expect(sideUpcoming).toHaveLength(1);
    expect(sideUpcoming[0]?.visitorName).toBe("SideUpcoming");
    expect(sidePast).toHaveLength(0);

    const primaryCaller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: primaryWorkspaceSlug,
      }),
    );
    const { upcoming: primaryUpcoming, past: primaryPast } =
      await primaryCaller.bookings.listForHost();
    expect(primaryUpcoming).toHaveLength(0);
    expect(primaryPast).toHaveLength(1);
    expect(primaryPast[0]?.visitorName).toBe("PrimaryHistoric");
  });
});

describe("bookings.getDetail — prev/next stays in the booking's workspace (B.PT16)", () => {
  let host: { id: string; handle: string };
  let primaryWorkspaceId: string;
  let primaryWorkspaceSlug: string;
  let sideWorkspaceId: string;
  let sideWorkspaceSlug: string;

  beforeAll(async () => {
    host = await createTestHost("vitest-detail-ws");
    const primary = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: host.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true },
    });
    primaryWorkspaceId = primary.id;
    primaryWorkspaceSlug = primary.slug;
    const side = await createTestWorkspaceForUser(
      host.id,
      `vitest-detail-ws-side`,
    );
    sideWorkspaceId = side.id;
    sideWorkspaceSlug = side.slug;
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { workspaceId: sideWorkspaceId } });
    await prisma.workspace.deleteMany({ where: { id: sideWorkspaceId } });
    await tearDownTestHost(host.id);
  });

  it("does NOT cross workspaces in prev/next nav", async () => {
    // primary: t+0, t+30
    // side:    t+15
    // Detail on primary t+30 should chain back to primary t+0 (not
    // to the t+15 side row that sits in between by slotStart).
    const primaryEarlier = await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "PrimaryEarlier",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(15),
      visitorName: "SideMiddle",
    });
    const primaryLater = await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(30),
      visitorName: "PrimaryLater",
    });

    const caller = callRouter(
      // Active workspace deliberately set to side — confirms prev/
      // next is NOT keyed off active workspace, just the booking's
      // own workspace.
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: sideWorkspaceSlug,
      }),
    );
    const detail = await caller.bookings.getDetail({
      publicUid: primaryLater.publicUid,
    });

    expect(detail.previousUid).toBe(primaryEarlier.publicUid);
    expect(detail.nextUid).toBeNull();
  });

  it("uses the booking's workspace regardless of active workspace match", async () => {
    // Two side-workspace bookings flanking one primary in the
    // middle. Detail on the side-earlier row's neighbors should
    // skip the primary row even if the active workspace IS primary.
    const sideEarlier = await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(0),
      visitorName: "SideEarlier",
    });
    await createTestBooking({
      hostId: host.id,
      workspaceId: primaryWorkspaceId,
      slotStart: tomorrowAtMinute(15),
      visitorName: "PrimaryMiddle",
    });
    const sideLater = await createTestBooking({
      hostId: host.id,
      workspaceId: sideWorkspaceId,
      slotStart: tomorrowAtMinute(30),
      visitorName: "SideLater",
    });

    const caller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: primaryWorkspaceSlug,
      }),
    );
    const detail = await caller.bookings.getDetail({
      publicUid: sideEarlier.publicUid,
    });

    expect(detail.previousUid).toBeNull();
    expect(detail.nextUid).toBe(sideLater.publicUid);
  });
});
