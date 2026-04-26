import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { POST as cleanupHandler } from "@/app/api/cron/cleanup-bookings/route";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-cleanup";
const CRON_SECRET = "vitest-cleanup-secret";
const RETENTION_MS = 30 * 86_400_000;

function authedRequest() {
  return new Request("http://localhost/api/cron/cleanup-bookings", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("cron — cleanup-bookings", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    process.env.CRON_SECRET = CRON_SECRET;
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("401s without authorization", async () => {
    const res = await cleanupHandler(
      new Request("http://localhost/x", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("401s with wrong bearer", async () => {
    const res = await cleanupHandler(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns deleted: 0 when no expired rows", async () => {
    const res = await cleanupHandler(authedRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(0);
  });

  it("hard-deletes a booking soft-deleted > 30d ago and preserves its audit rows", async () => {
    const visitorCaller = callRouter(fakeContext({}));
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: created.publicUid });

    const old = new Date(Date.now() - RETENTION_MS - 60_000);
    await prisma.booking.update({
      where: { publicUid: created.publicUid },
      data: { deletedAt: old },
    });

    const res = await cleanupHandler(authedRequest());
    const json = await res.json();
    expect(json.deleted).toBe(1);
    expect(json.sample).toContain(created.publicUid);

    const stillThere = await prisma.booking.findUnique({
      where: { publicUid: created.publicUid },
    });
    expect(stillThere).toBeNull();

    const audit = await prisma.bookingAudit.findMany({
      where: { bookingUid: created.publicUid },
      select: { action: true },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it("skips bookings still inside the retention window", async () => {
    const visitorCaller = callRouter(fakeContext({}));
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(15).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });
    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: created.publicUid });
    await prisma.booking.update({
      where: { publicUid: created.publicUid },
      data: { deletedAt: new Date(Date.now() - 7 * 86_400_000) },
    });

    const res = await cleanupHandler(authedRequest());
    const json = await res.json();
    expect(json.deleted).toBe(0);

    const stillThere = await prisma.booking.findUnique({
      where: { publicUid: created.publicUid },
      select: { deleted: true },
    });
    expect(stillThere?.deleted).toBe(true);
  });
});
