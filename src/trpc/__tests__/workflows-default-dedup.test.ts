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

// A4 — A8's hardcoded reminder gets suppressed when the host has any
// active matching workflow rule. Asserts the dedup contract:
//   1. With the seeded default workflow → exactly ONE booking-reminder
//      Task is created (the workflow-engine one, not the hardcoded
//      one).
//   2. Without any matching workflow → the hardcoded path still fires
//      (legacy / hand-deleted-row case).
// Without this contract, every booking would enqueue two reminder
// emails: one from the hardcoded path in bookings.create + one from
// dispatchWorkflows({ trigger: "BEFORE_EVENT" }).

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
  // Task.referenceUid is nullable — filter early so the predicates
  // below operate on non-null strings.
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
    // Each test sets its own workflow state — wipe between tests so a
    // prior test's workflow row doesn't leak into the next.
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
  });

  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("with default workflow seeded → ONLY the workflow-engine reminder Task is enqueued", async () => {
    // Seed exactly the shape the registration path would.
    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
      },
    });

    const caller = callRouter(fakeContext());
    // Slot 2h out so reminderAt (slotStart - 1h) is still in the
    // future when the workflow engine evaluates the rule.
    // tomorrowAtMinute(0) is the canonical "always-bookable upcoming
    // slot" used by every other booking test in the repo. Aligns to
    // the host's createTestHost weekday 00:00-23:45 grid.
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
    // No workflow rows exist for the host (beforeEach wiped them).

    const caller = callRouter(fakeContext());
    // tomorrowAtMinute(0) is the canonical "always-bookable upcoming
    // slot" used by every other booking test in the repo. Aligns to
    // the host's createTestHost weekday 00:00-23:45 grid.
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
    // tomorrowAtMinute(0) is the canonical "always-bookable upcoming
    // slot" used by every other booking test in the repo. Aligns to
    // the host's createTestHost weekday 00:00-23:45 grid.
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

  // Sanity-check the helper directly (cheap, independent of the
  // booking flow). Covers the "user customized offset to 30 min" case
  // explicitly — the suppression should still trigger because the
  // trigger/action/template match.
  it("hasMatchingReminderWorkflow respects active flag + ignores offset variations", async () => {
    const { hasMatchingReminderWorkflow } = await import("@/lib/workflows");

    expect(await hasMatchingReminderWorkflow(host.id)).toBe(false);

    // Custom offset, still suppresses.
    await prisma.workflow.create({
      data: {
        userId: host.id,
        ...DEFAULT_REMINDER_WORKFLOW,
        offsetMinutes: 30,
      },
    });
    expect(await hasMatchingReminderWorkflow(host.id)).toBe(true);

    await prisma.workflow.deleteMany({ where: { userId: host.id } });

    // Wrong template — does NOT match (different reminder).
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
