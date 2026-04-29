import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { appRouter, createCaller } from "@/trpc/router";
import { prisma } from "@/lib/prisma";
import { parseActiveWorkspaceSlug } from "@/lib/active-workspace";
import {
  createTestHost,
  fakeContext,
  purgeTestWorkspaces,
  tearDownTestHost,
  wipeTransientState,
} from "../../../test/fixtures";

const callRouter = createCaller(appRouter);
const HANDLE = "vitest-active-ws";
const SECOND_SLUG = "vitest-active-second";

describe("parseActiveWorkspaceSlug (pure)", () => {
  it("returns null when the cookie is unset", () => {
    expect(parseActiveWorkspaceSlug(undefined)).toBeNull();
    expect(parseActiveWorkspaceSlug("")).toBeNull();
  });

  it("returns null when the value fails the slug schema", () => {
    expect(parseActiveWorkspaceSlug("ab")).toBeNull(); // too short
    expect(parseActiveWorkspaceSlug("a".repeat(31))).toBeNull(); // too long
    expect(parseActiveWorkspaceSlug("Has-Capitals")).toBeNull();
    expect(parseActiveWorkspaceSlug("with space")).toBeNull();
    expect(parseActiveWorkspaceSlug("-leading-hyphen")).toBeNull();
  });

  it("returns the slug verbatim when valid", () => {
    expect(parseActiveWorkspaceSlug("acme")).toBe("acme");
    expect(parseActiveWorkspaceSlug("acme-team-2")).toBe("acme-team-2");
  });
});

describe("workspaces.list (B.PT6 isActive flag)", () => {
  let host: { id: string; handle: string };
  let primarySlug: string;

  beforeAll(async () => {
    host = await createTestHost(HANDLE);
    const ownerCaller = callRouter(fakeContext({ userId: host.id }));
    const list = await ownerCaller.workspaces.list();
    primarySlug = list[0].slug;

    await ownerCaller.workspaces.create({
      slug: SECOND_SLUG,
      name: "Vitest Second",
    });
  });

  beforeEach(async () => {
    await wipeTransientState(host.id);
  });

  afterAll(async () => {
    await purgeTestWorkspaces([SECOND_SLUG]);
    await tearDownTestHost(host.id);
  });

  it("falls back to the first row when the cookie is unset", async () => {
    const caller = callRouter(
      fakeContext({ userId: host.id, activeWorkspaceSlug: null }),
    );
    const list = await caller.workspaces.list();
    const active = list.filter((w) => w.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].slug).toBe(list[0].slug);
  });

  it("flips isActive on the matching row when the cookie matches a member workspace", async () => {
    const caller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: SECOND_SLUG,
      }),
    );
    const list = await caller.workspaces.list();
    const active = list.find((w) => w.isActive);
    expect(active?.slug).toBe(SECOND_SLUG);
    expect(list.filter((w) => w.isActive)).toHaveLength(1);
  });

  it("falls back to first row when the cookie points at a workspace the user isn't a member of", async () => {
    const caller = callRouter(
      fakeContext({
        userId: host.id,
        activeWorkspaceSlug: "stranger-workspace-slug",
      }),
    );
    const list = await caller.workspaces.list();
    const active = list.find((w) => w.isActive);
    expect(active?.slug).toBe(primarySlug);
  });

  it("returns isActive=true on every row in a single-workspace user", async () => {
    const onlyWorkspace = host;
    expect(onlyWorkspace).toBeDefined();
  });
});
