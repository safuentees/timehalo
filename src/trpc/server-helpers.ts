import { auth } from "@/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { cookies as nextCookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  ACTIVE_WORKSPACE_COOKIE,
  parseActiveWorkspaceSlug,
} from "@/lib/active-workspace";
import { appRouter } from "./router";

// Pull the active-workspace cookie from `next/headers` so SSR
// prefetches see the same `ctx.activeWorkspaceSlug` the browser will
// see on hydration. Returns null when unset or malformed; the
// procedure layer falls back to workspaces[0].
async function readActiveWorkspaceSlug(): Promise<string | null> {
  const jar = await nextCookies();
  return parseActiveWorkspaceSlug(jar.get(ACTIVE_WORKSPACE_COOKIE)?.value);
}

export const createPrivateSSRHelper = cache(async () => {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const activeWorkspaceSlug = await readActiveWorkspaceSlug();

  return createServerSideHelpers({
    router: appRouter,
    ctx: {
      user: session.user,
      // SSR helpers don't go through the HTTP rate-limit middleware,
      // but the Context type requires this field. "ssr" is a stable
      // sentinel that won't collide with a real client IP.
      ipIdentifier: "ssr",
      // No request → no cookies map. The active-workspace slug is
      // pulled directly via next/headers above so SSR matches CSR.
      cookies: new Map<string, string>(),
      activeWorkspaceSlug,
    },
  });
});

export const createPublicSSRHelper = cache(async () => {
  const session = await auth();
  const activeWorkspaceSlug = await readActiveWorkspaceSlug();

  return createServerSideHelpers({
    router: appRouter,
    ctx: {
      user: session?.user ?? null,
      ipIdentifier: "ssr",
      cookies: new Map<string, string>(),
      activeWorkspaceSlug,
    },
  });
});
