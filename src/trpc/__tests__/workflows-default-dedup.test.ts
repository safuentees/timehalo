import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { TASK_TYPE_EMAIL_SEND } from "@/lib/tasks";
import { DEFAULT_REMINDER_WORKFLOW } from "@/lib/workflows";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-a4-dedup";

async function countReminderTasks(bookingPublicUid: string): Promise<{
  hardcoded: number;
  workflow: number;
}> {
  const all = await prisma.task.findMany({
    where: { type: TASK_TYPE_EMAIL_SEND },
    select: { referenceUid: true },
  });
  const forThisBooking = all
    .filter((t): t is { referenceUid: string } => t.referenceUid !== null)
    .filter((t) => t.referenceUid.startsWith(bookingPublicUid));
  const hardcoded = forThisBooking.filter((t) =>
    t.referenceUid.endsWith(":email:booking-reminder:visitor"),
  ).length;
  const workflow = forThisBooking.filter((t) =>
    t.referenceUid.includes(":workflow:"),
  ).length;
  return { hardcoded, workflow };
}

describe("A4 — default reminder workflow dedup", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
  });

  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("with default workflow seeded → ONLY the workflow-engine reminder Task is enqueued", async () => {
    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
      },
    });

    const caller = callRouter(fakeContext());
    const slotStart = tomorrowAtMinute(0);
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: slotStart.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const { hardcoded, workflow } = await countReminderTasks(created.publicUid);
    expect(hardcoded).toBe(0); // suppressed
    expect(workflow).toBe(1); // workflow engine fired
  });

  it("without any matching workflow → the hardcoded reminder path still fires", async () => {

    const caller = callRouter(fakeContext());
    const slotStart = tomorrowAtMinute(0);
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: slotStart.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const { hardcoded, workflow } = await countReminderTasks(created.publicUid);
    expect(hardcoded).toBe(1); // fallback fires
    expect(workflow).toBe(0); // no rule, no workflow Task
  });

  it("with an INACTIVE matching workflow → falls back to hardcoded (active filter holds)", async () => {
    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
        active: false,
      },
    });

    const caller = callRouter(fakeContext());
    const slotStart = tomorrowAtMinute(0);
    const created = await caller.bookings.create({
      handle: host.handle,
      slotStart: slotStart.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const { hardcoded } = await countReminderTasks(created.publicUid);
    expect(hardcoded).toBe(1); // active=false → hasMatching... returns false → fallback
  });

  it("hasMatchingReminderWorkflow respects active flag + ignores offset variations", async () => {
    const { hasMatchingReminderWorkflow } = await import("@/lib/workflows");

    expect(await hasMatchingReminderWorkflow(host.id)).toBe(false);

    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
        offsetMinutes: 30,
      },
    });
    expect(await hasMatchingReminderWorkflow(host.id)).toBe(true);

    await prisma.workflow.deleteMany({ where: { userId: host.id } });

    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
        template: "booking-rescheduled",
      },
    });
    expect(await hasMatchingReminderWorkflow(host.id)).toBe(false);
  });
});
