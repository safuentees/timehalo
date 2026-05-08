import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password";
import { fakeContext } from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const EMAIL_DOMAIN = "register.test";
const HANDLE_PREFIX = "vitest-register";

async function cleanupRegisterUsers() {
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: `@${EMAIL_DOMAIN}` } },
        { handle: { startsWith: HANDLE_PREFIX } },
        { handle: { startsWith: "u-" } },
      ],
    },
  });
}

// B.PT285 — handle removed from the register procedure input. Handle
// is auto-generated as a placeholder (`u-<5char>`). Tests assert on
// the placeholder shape and on downstream workspace/eventType seeding
// that derives from it.
describe("auth.register", () => {
  beforeEach(async () => {
    await cleanupRegisterUsers();
  });

  afterAll(async () => {
    await cleanupRegisterUsers();
    await prisma.$disconnect();
  });

  it("creates a credentials user with a hashed password and a placeholder handle", async () => {
    const caller = callRouter(fakeContext());
    const password = "correct-horse-battery";

    const created = await caller.auth.register({
      email: "NewUser@REGISTER.TEST",
      password,
    });

    expect(created.email).toBe(`newuser@${EMAIL_DOMAIN}`);
    expect(created.handle).toMatch(/^u-[a-z0-9]{5}$/);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        email: true,
        handle: true,
        passwordHash: true,
      },
    });

    expect(user.email).toBe(`newuser@${EMAIL_DOMAIN}`);
    expect(user.handle).toMatch(/^u-[a-z0-9]{5}$/);
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
    });

    await expect(
      caller.auth.register({
        email: `DUPLICATE@${EMAIL_DOMAIN}`,
        password: "password-two",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That email is already registered.",
    });
  });

  it("creates a default workspace + OWNER membership in one transaction", async () => {
    const caller = callRouter(fakeContext());
    const created = await caller.auth.register({
      email: `workspace@${EMAIL_DOMAIN}`,
      password: "correct-horse-battery",
    });

    // Workspace is owned by the new user, slug derived from the
    // auto-generated placeholder handle.
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { ownerId: created.id },
      select: { id: true, slug: true, name: true },
    });
    expect(workspace.slug).toBe(created.handle);
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
    const created = await caller.auth.register({
      email: `availability@${EMAIL_DOMAIN}`,
      password: "password-one",
    });

    await expect(
      caller.auth.handleAvailability({
        handle: `${HANDLE_PREFIX}-fresh`,
      }),
    ).resolves.toEqual({ available: true });
    if (created.handle) {
      await expect(
        caller.auth.handleAvailability({ handle: created.handle }),
      ).resolves.toEqual({ available: false });
    }
    await expect(
      caller.auth.handleAvailability({ handle: "admin" }),
    ).resolves.toEqual({ available: false });
  });
});
