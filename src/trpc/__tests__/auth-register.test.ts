import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password";
import { fakeContext } from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE_PREFIX = "vitest-register";
const EMAIL_DOMAIN = "register.test";

async function cleanupRegisterUsers() {
  await prisma.user.deleteMany({
    where: {
      OR: [
        { handle: { startsWith: HANDLE_PREFIX } },
        { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      ],
    },
  });
}

describe("auth.register", () => {
  beforeEach(async () => {
    await cleanupRegisterUsers();
  });

  afterAll(async () => {
    await cleanupRegisterUsers();
    await prisma.$disconnect();
  });

  it("creates a credentials user with a hashed password", async () => {
    const caller = callRouter(fakeContext());
    const password = "correct-horse-battery";

    const created = await caller.auth.register({
      email: "NewUser@REGISTER.TEST",
      password,
      handle: `${HANDLE_PREFIX}-new`,
    });

    expect(created.email).toBe(`newuser@${EMAIL_DOMAIN}`);
    expect(created.handle).toBe(`${HANDLE_PREFIX}-new`);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        email: true,
        handle: true,
        passwordHash: true,
      },
    });

    expect(user.email).toBe(`newuser@${EMAIL_DOMAIN}`);
    expect(user.handle).toBe(`${HANDLE_PREFIX}-new`);
    const passwordHash = user.passwordHash;
    expect(passwordHash).toBeTruthy();
    if (!passwordHash) return;
    expect(passwordHash).not.toBe(password);
    expect(
      await validatePassword({
        password,
        passwordHash,
      }),
    ).toBe(true);
  });

  it("maps duplicate email to CONFLICT", async () => {
    const caller = callRouter(fakeContext());
    await caller.auth.register({
      email: `duplicate@${EMAIL_DOMAIN}`,
      password: "password-one",
      handle: `${HANDLE_PREFIX}-first`,
    });

    await expect(
      caller.auth.register({
        email: `DUPLICATE@${EMAIL_DOMAIN}`,
        password: "password-two",
        handle: `${HANDLE_PREFIX}-second`,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That email is already registered.",
    });
  });

  it("maps duplicate and reserved handles to unavailable", async () => {
    const caller = callRouter(fakeContext());
    await caller.auth.register({
      email: `handle-owner@${EMAIL_DOMAIN}`,
      password: "password-one",
      handle: `${HANDLE_PREFIX}-taken`,
    });

    await expect(
      caller.auth.register({
        email: `handle-next@${EMAIL_DOMAIN}`,
        password: "password-two",
        handle: `${HANDLE_PREFIX}-taken`,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That handle is taken. Pick another.",
    });

    await expect(
      caller.auth.register({
        email: `reserved@${EMAIL_DOMAIN}`,
        password: "password-two",
        handle: "admin",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That handle is taken. Pick another.",
    });
  });

  it("creates a default workspace + OWNER membership in one transaction", async () => {
    const caller = callRouter(fakeContext());
    const handle = `${HANDLE_PREFIX}-workspace`;
    const created = await caller.auth.register({
      email: `workspace@${EMAIL_DOMAIN}`,
      password: "correct-horse-battery",
      handle,
    });

    // Workspace is owned by the new user, slug derived from the handle.
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: created.id },
      select: { id: true, slug: true, name: true },
    });
    expect(workspace.slug).toBe(handle);
    expect(workspace.name).toBe("Personal");

    // Single OWNER membership ties the user to the workspace.
    const membership = await prisma.membership.findFirstOrThrow({
      where: { workspaceId: workspace.id, userId: created.id },
      select: { role: true },
    });
    expect(membership.role).toBe("OWNER");

    // Pair shape — one workspace, one OWNER membership, no orphans.
    const wsCount = await prisma.workspace.count({
      where: { ownerId: created.id },
    });
    expect(wsCount).toBe(1);
  });

  it("reports handle availability from the database and reserved list", async () => {
    const caller = callRouter(fakeContext());
    await caller.auth.register({
      email: `availability@${EMAIL_DOMAIN}`,
      password: "password-one",
      handle: `${HANDLE_PREFIX}-availability`,
    });

    await expect(
      caller.auth.handleAvailability({
        handle: `${HANDLE_PREFIX}-fresh`,
      }),
    ).resolves.toEqual({ available: true });
    await expect(
      caller.auth.handleAvailability({
        handle: `${HANDLE_PREFIX}-availability`,
      }),
    ).resolves.toEqual({ available: false });
    await expect(
      caller.auth.handleAvailability({ handle: "admin" }),
    ).resolves.toEqual({ available: false });
  });
});
