import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bootstrapUserWorkspace, resolveAuthRedirect } from "@/lib/auth-events";
import { prisma } from "@/lib/prisma";

const seededIds: string[] = [];

async function makeBareUser(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `auth-events-${suffix}-${Date.now()}@example.com` },
    select: { id: true, email: true },
  });
  seededIds.push(user.id);
  return user;
}

describe("bootstrapUserWorkspace", () => {
  beforeEach(() => {
    seededIds.length = 0;
  });

  afterEach(async () => {
    if (seededIds.length === 0) return;
    await prisma.membership.deleteMany({ where: { userId: { in: seededIds } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: seededIds } } });
    await prisma.user.deleteMany({ where: { id: { in: seededIds } } });
  });

  it("creates a Personal Workspace + OWNER Membership for a fresh user", async () => {
    const user = await makeBareUser("fresh");
    await bootstrapUserWorkspace(user);

    const ws = await prisma.workspace.findFirst({
      where: { ownerId: user.id },
      select: { id: true, slug: true, name: true },
    });
    expect(ws?.slug).toBe(`personal-${user.id}`);
    expect(ws?.name).toBe("Personal");

    const mem = await prisma.membership.findFirst({
      where: { userId: user.id, workspaceId: ws!.id },
      select: { role: true },
    });
    expect(mem?.role).toBe("OWNER");
  });

  it("is idempotent — second call is a no-op when a workspace already exists", async () => {
    const user = await makeBareUser("idempotent");
    await bootstrapUserWorkspace(user);
    await bootstrapUserWorkspace(user);

    const count = await prisma.workspace.count({ where: { ownerId: user.id } });
    expect(count).toBe(1);
  });
});

describe("resolveAuthRedirect", () => {
  const baseUrl = "http://localhost:3000";

  it("rewrites /login to /bookings — magic-link initiated from /login carries callbackUrl=/login", () => {
    expect(resolveAuthRedirect({ url: "/login", baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
    expect(resolveAuthRedirect({ url: `${baseUrl}/login`, baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
  });

  it("rewrites /register and / to /bookings", () => {
    expect(resolveAuthRedirect({ url: "/register", baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
    expect(resolveAuthRedirect({ url: "/", baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
    expect(resolveAuthRedirect({ url: baseUrl, baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
  });

  it("preserves same-origin deep links that aren't auth pages", () => {
    expect(resolveAuthRedirect({ url: "/availability", baseUrl })).toBe(
      "http://localhost:3000/availability",
    );
    expect(resolveAuthRedirect({ url: `${baseUrl}/profile?tab=billing`, baseUrl })).toBe(
      `${baseUrl}/profile?tab=billing`,
    );
  });

  it("rejects foreign origins with /bookings fallback", () => {
    expect(resolveAuthRedirect({ url: "https://evil.example/steal", baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
  });

  it("survives malformed URLs", () => {
    expect(resolveAuthRedirect({ url: "not a url", baseUrl })).toBe(
      "http://localhost:3000/bookings",
    );
  });
});
