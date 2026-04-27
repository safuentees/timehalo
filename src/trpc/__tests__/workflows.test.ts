import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { TASK_TYPE_EMAIL_SEND, type EmailSendPayload } from "@/lib/tasks";
import {
  createTestHost,
  fakeContext,
  tearDownTestHost,
  tomorrowAtMinute,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-workflows";

describe("workflows.create cross-field validation", () => {
  let host: { id: string };

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
  });
  afterAll(async () => {
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
    await tearDownTestHost(host.id);
  });

  it("rejects EMAIL_VISITOR without a template", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.workflows.create({
        name: "no template",
        trigger: "EVENT_CREATED",
        offsetMinutes: 0,
        action: "EMAIL_VISITOR",
      }),
    ).rejects.toThrow(/template/i);
  });

  it("rejects WEBHOOK_FIRE without a webhookEvent", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await expect(
      caller.workflows.create({
        name: "no event",
        trigger: "EVENT_CREATED",
        offsetMinutes: 0,
        action: "WEBHOOK_FIRE",
      }),
    ).rejects.toThrow(/webhookEvent/i);
  });

  it("zeroes offsetMinutes when trigger isn't BEFORE_EVENT", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const w = await caller.workflows.create({
      name: "on-create",
      trigger: "EVENT_CREATED",
      offsetMinutes: 60,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    expect(w.offsetMinutes).toBe(0);
  });
});

describe("workflows CRUD", () => {
  let host: { id: string };
  let stranger: { id: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-crud`);
    stranger = await createTestHost(`${HANDLE}-stranger`);
  });
  beforeEach(async () => {
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
    await prisma.workflow.deleteMany({ where: { userId: stranger.id } });
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
    await tearDownTestHost(stranger.id);
  });

  it("create + list returns the row scoped to the caller", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    await caller.workflows.create({
      name: "24h reminder",
      trigger: "BEFORE_EVENT",
      offsetMinutes: 24 * 60,
      action: "EMAIL_VISITOR",
      template: "booking-reminder",
    });
    const list = await caller.workflows.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("24h reminder");
    expect(list[0].offsetMinutes).toBe(24 * 60);
  });

  it("list returns only the caller's rows", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    await ownerCaller.workflows.create({
      name: "mine",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    const strangerCaller = callRouter(
      fakeContext({ userId: stranger.id }),
    );
    const list = await strangerCaller.workflows.list();
    expect(list).toEqual([]);
  });

  it("update flips active without affecting other fields", async () => {
    const caller = callRouter(fakeContext({ userId: host.id }));
    const w = await caller.workflows.create({
      name: "toggle",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    await caller.workflows.update({ id: w.id, active: false });
    const after = await prisma.workflow.findUniqueOrThrow({
      where: { id: w.id },
      select: { active: true, name: true },
    });
    expect(after.active).toBe(false);
    expect(after.name).toBe("toggle");
  });

  it("update rejects rows owned by another user", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "mine",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    const strangerCaller = callRouter(
      fakeContext({ userId: stranger.id }),
    );
    await expect(
      strangerCaller.workflows.update({ id: w.id, active: false }),
    ).rejects.toThrow(TRPCError);
  });

  it("delete is caller-scoped", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "mine",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    const strangerCaller = callRouter(
      fakeContext({ userId: stranger.id }),
    );
    await expect(
      strangerCaller.workflows.delete({ id: w.id }),
    ).rejects.toThrow(TRPCError);
    await ownerCaller.workflows.delete({ id: w.id });
    expect(
      await prisma.workflow.findUnique({ where: { id: w.id } }),
    ).toBeNull();
  });
});

describe("engine integration — bookings.create dispatches workflows", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-engine`);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("EVENT_CREATED rule enqueues an emailSend with the workflow ref uid", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "ack-on-create",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_HOST",
      template: "booking-created",
    });

    const visitorCaller = callRouter(fakeContext());
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const tasks = await prisma.task.findMany({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: { contains: `:workflow:${w.id}:` },
      },
      select: { payload: true },
    });
    expect(tasks).toHaveLength(1);
    const payload = JSON.parse(tasks[0].payload) as EmailSendPayload;
    expect(payload.template).toBe("booking-created");
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: host.id },
      select: { email: true },
    });
    expect(payload.to).toBe(row.email);
  });

  it("BEFORE_EVENT rule schedules the Task at slotStart - offset", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "1h reminder",
      trigger: "BEFORE_EVENT",
      offsetMinutes: 60,
      action: "EMAIL_VISITOR",
      template: "booking-reminder",
    });

    const slotStart = tomorrowAtMinute(0);
    const visitorCaller = callRouter(fakeContext());
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: slotStart.toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const task = await prisma.task.findFirstOrThrow({
      where: {
        type: TASK_TYPE_EMAIL_SEND,
        referenceUid: { contains: `:workflow:${w.id}:` },
      },
      select: { scheduledAt: true },
    });
    const expected = slotStart.getTime() - 60 * 60_000;
    expect(Math.abs(task.scheduledAt.getTime() - expected)).toBeLessThan(
      2_000,
    );
  });

  it("inactive rule does not enqueue", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "off",
      trigger: "EVENT_CREATED",
      offsetMinutes: 0,
      action: "EMAIL_VISITOR",
      template: "booking-created",
    });
    await ownerCaller.workflows.update({ id: w.id, active: false });

    const visitorCaller = callRouter(fakeContext());
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const tasks = await prisma.task.findMany({
      where: { referenceUid: { contains: `:workflow:${w.id}:` } },
    });
    expect(tasks).toEqual([]);
  });

  it("BEFORE_EVENT skips when the offset puts firing in the past", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "huge offset",
      trigger: "BEFORE_EVENT",
      offsetMinutes: 7 * 24 * 60,
      action: "EMAIL_VISITOR",
      template: "booking-reminder",
    });

    const visitorCaller = callRouter(fakeContext());
    await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const tasks = await prisma.task.findMany({
      where: { referenceUid: { contains: `:workflow:${w.id}:` } },
    });
    expect(tasks).toEqual([]);
  });
});

describe("engine integration — cancel supersedes workflow tasks", () => {
  let host: { id: string; handle: string };

  beforeAll(async () => {
    host = await createTestHost(`${HANDLE}-cancel`);
  });
  beforeEach(async () => {
    await wipeTransientState(host.id);
    await prisma.workflow.deleteMany({ where: { userId: host.id } });
  });
  afterAll(async () => {
    await tearDownTestHost(host.id);
  });

  it("bookings.cancel marks pending workflow Tasks succeededAt", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const w = await ownerCaller.workflows.create({
      name: "1h reminder",
      trigger: "BEFORE_EVENT",
      offsetMinutes: 60,
      action: "EMAIL_VISITOR",
      template: "booking-reminder",
    });

    const visitorCaller = callRouter(fakeContext());
    const created = await visitorCaller.bookings.create({
      handle: host.handle,
      slotStart: tomorrowAtMinute(0).toISOString(),
      visitorName: "Maya",
      visitorEmail: "maya@example.com",
      idempotencyKey: crypto.randomUUID(),
    });

    const before = await prisma.task.findFirstOrThrow({
      where: { referenceUid: { contains: `:workflow:${w.id}:` } },
      select: { succeededAt: true },
    });
    expect(before.succeededAt).toBeNull();

    const hostCaller = callRouter(fakeContext({ userId: host.id }));
    await hostCaller.bookings.cancel({ publicUid: created.publicUid });

    const after = await prisma.task.findFirstOrThrow({
      where: { referenceUid: { contains: `:workflow:${w.id}:` } },
      select: { succeededAt: true, lastError: true },
    });
    expect(after.succeededAt).not.toBeNull();
    expect(after.lastError).toMatch(/superseded|cancelled/i);
  });
});
