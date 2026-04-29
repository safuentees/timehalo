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
import { GET as whoamiGet } from "@/app/api/v1/whoami/route";
import { GET as openapiGet } from "@/app/api/openapi.json/route";
import { prisma } from "@/lib/prisma";
import {
  generateApiKey,
  parseScopes,
  verifyApiKey,
} from "@/lib/api-keys";
import {
  createTestUser,
  fakeContext,
  tearDownTestHost,
  upgradeWorkspaceToPro,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const SLUG = "vitest-apikeys";

async function purge(slug: string) {
  const ws = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!ws) return;
  await prisma.apiKey.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.invitation.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.membership.deleteMany({ where: { workspaceId: ws.id } });
  await prisma.workspace.delete({ where: { id: ws.id } });
}

describe("api-keys helper", () => {
  it("generateApiKey returns oh_-prefixed token + 12-char prefix + 64-char hex hash", () => {
    const k = generateApiKey();
    expect(k.token.startsWith("oh_")).toBe(true);
    expect(k.prefix.length).toBe(12);
    expect(k.token.startsWith(k.prefix)).toBe(true);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two consecutive generations produce different tokens", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("parseScopes drops unknown values + dedups via set semantics", () => {
    const set = parseScopes(
      "bookings.read, bookings.write, mystery, bookings.read",
    );
    expect(set.has("bookings.read")).toBe(true);
    expect(set.has("bookings.write")).toBe(true);
    expect(set.size).toBe(2);
  });
});

describe("workspaces.apiKeys procedures", () => {
  let owner: { id: string };
  let stranger: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-ak-owner");
    stranger = await createTestUser("vitest-ak-stranger");
  });
  beforeEach(async () => {
    await purge(SLUG);
  });
  afterAll(async () => {
    await purge(SLUG);
    await tearDownTestHost(owner.id);
    await tearDownTestHost(stranger.id);
  });

  it("create returns the full token exactly once + persists hash", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Acme" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    const result = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["bookings.read", "workspace.read"],
    });

    expect(result.token.startsWith("oh_")).toBe(true);
    expect(result.token.length).toBe(27);
    expect(result.prefix.length).toBe(12);

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: result.id },
      select: { tokenHash: true, scopes: true },
    });
    expect(row.tokenHash).not.toBe(result.token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.scopes).toBe("bookings.read,workspace.read");
  });

  it("list never surfaces the secret — only prefix", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Acme" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["bookings.read"],
    });
    const list = await ownerCaller.workspaces.apiKeys.list({ slug: SLUG });
    expect(list.length).toBe(1);
    expect(list[0]).not.toHaveProperty("token");
    expect(list[0]).not.toHaveProperty("tokenHash");
    expect(list[0].prefix.length).toBe(12);
  });

  it("create rejects scopes the creator's role doesn't grant", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Acme",
    });
    await upgradeWorkspaceToPro({ id: ws.id });
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: stranger.id,
        role: "ADMIN",
      },
    });
    const adminCaller = callRouter(fakeContext({ userId: stranger.id }));
    await expect(
      adminCaller.workspaces.apiKeys.create({
        slug: SLUG,
        name: "elevated",
        scopes: ["workspace.write"],
      }),
    ).rejects.toThrow(/exceeds creator role|FORBIDDEN/i);
  });

  it("revoke flips revokedAt + idempotent (NOT_FOUND on re-revoke)", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Acme" });
    await upgradeWorkspaceToPro({ slug: SLUG });
    const created = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["bookings.read"],
    });
    await ownerCaller.workspaces.apiKeys.revoke({
      slug: SLUG,
      keyId: created.id,
    });
    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.id },
      select: { revokedAt: true },
    });
    expect(row.revokedAt).not.toBeNull();
    await expect(
      ownerCaller.workspaces.apiKeys.revoke({
        slug: SLUG,
        keyId: created.id,
      }),
    ).rejects.toThrow(TRPCError);
  });
});

describe("verifyApiKey", () => {
  let owner: { id: string };
  let workspaceId: string;

  beforeAll(async () => {
    owner = await createTestUser("vitest-vk-owner");
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const ws = await ownerCaller.workspaces.create({
      slug: SLUG,
      name: "Acme",
    });
    await upgradeWorkspaceToPro({ id: ws.id });
    workspaceId = ws.id;
  });
  beforeEach(async () => {
    await prisma.apiKey.deleteMany({ where: { workspaceId } });
  });
  afterAll(async () => {
    await purge(SLUG);
    await tearDownTestHost(owner.id);
  });

  it("returns the matched key + scope set on a valid token", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const minted = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["bookings.read", "workspace.read"],
    });
    const verified = await verifyApiKey(minted.token);
    expect(verified).not.toBeNull();
    if (!verified) return;
    expect(verified.id).toBe(minted.id);
    expect(verified.scopes.has("bookings.read")).toBe(true);
    expect(verified.scopes.has("workspace.read")).toBe(true);
  });

  it("rejects revoked keys", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const minted = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["workspace.read"],
    });
    await ownerCaller.workspaces.apiKeys.revoke({
      slug: SLUG,
      keyId: minted.id,
    });
    const verified = await verifyApiKey(minted.token);
    expect(verified).toBeNull();
  });

  it("rejects expired keys", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const minted = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "ci",
      scopes: ["workspace.read"],
    });
    await prisma.apiKey.update({
      where: { id: minted.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const verified = await verifyApiKey(minted.token);
    expect(verified).toBeNull();
  });

  it("rejects garbage / wrong-prefix tokens", async () => {
    expect(await verifyApiKey("definitely-not-a-token")).toBeNull();
    expect(await verifyApiKey("oh_thishashasnomatch")).toBeNull();
  });
});

describe("/api/v1/whoami", () => {
  let owner: { id: string };

  beforeAll(async () => {
    owner = await createTestUser("vitest-w-owner");
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    await ownerCaller.workspaces.create({ slug: SLUG, name: "Acme" });
    await upgradeWorkspaceToPro({ slug: SLUG });
  });
  afterAll(async () => {
    await purge(SLUG);
    await tearDownTestHost(owner.id);
  });

  function bearerRequest(token: string | null): Request {
    return new Request("http://localhost/api/v1/whoami", {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it("401 with no Authorization header", async () => {
    const res = await whoamiGet(bearerRequest(null));
    expect(res.status).toBe(401);
  });

  it("401 with garbage token", async () => {
    const res = await whoamiGet(bearerRequest("oh_no_match_here"));
    expect(res.status).toBe(401);
  });

  it("403 when token lacks workspace.read scope", async () => {
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    const k = generateApiKey();
    await prisma.apiKey.create({
      data: {
        workspaceId: ws.id,
        name: "scopeless",
        prefix: k.prefix,
        tokenHash: k.hash,
        scopes: "bookings.read",
        createdById: owner.id,
      },
    });
    const res = await whoamiGet(bearerRequest(k.token));
    expect(res.status).toBe(403);
  });

  it("200 with valid token returns workspace + scope set", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const minted = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "valid",
      scopes: ["workspace.read", "bookings.read"],
    });
    const res = await whoamiGet(bearerRequest(minted.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace.slug).toBe(SLUG);
    expect(body.scopes).toContain("workspace.read");
    expect(body.scopes).toContain("bookings.read");
    expect(body.keyId).toBe(minted.id);
  });

  it("429 with Retry-After + X-RateLimit-* headers when per-key budget is exhausted", async () => {
    const ownerCaller = callRouter(fakeContext({ userId: owner.id }));
    const minted = await ownerCaller.workspaces.apiKeys.create({
      slug: SLUG,
      name: "rate-limit-target",
      scopes: ["workspace.read"],
    });
    for (let i = 0; i < 60; i++) {
      const ok = await whoamiGet(bearerRequest(minted.token));
      expect(ok.status).toBe(200);
    }
    const limited = await whoamiGet(bearerRequest(minted.token));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(limited.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(limited.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(limited.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
    const body = await limited.json();
    expect(body.error).toBe("rate_limited");
  });
});

describe("/api/openapi.json", () => {
  it("returns a valid OpenAPI 3.1 document", async () => {
    const res = await openapiGet();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Officehours API");
    expect(doc.paths["/api/v1/whoami"]).toBeDefined();
    expect(doc.paths["/api/v1/whoami"].get).toBeDefined();
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("declares the Bearer security scheme on /whoami", async () => {
    const res = await openapiGet();
    const doc = await res.json();
    const security = doc.paths["/api/v1/whoami"].get.security;
    expect(security).toEqual([{ bearerAuth: [] }]);
  });
});
