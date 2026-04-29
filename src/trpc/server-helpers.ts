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
      ipIdentifier: "ssr",
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
