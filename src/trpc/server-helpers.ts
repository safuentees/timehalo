import { auth } from "@/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { appRouter } from "./router";

export const createPrivateSSRHelper = cache(async () => {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return createServerSideHelpers({
    router: appRouter,
    ctx: {
      user: session.user,
      // SSR helpers don't go through the HTTP rate-limit middleware,
      // but the Context type requires this field. "ssr" is a stable
      // sentinel that won't collide with a real client IP.
      ipIdentifier: "ssr",
      // No request → no cookies. Empty Map keeps the type stable.
      cookies: new Map<string, string>(),
    },
  });
});

export const createPublicSSRHelper = cache(async () => {
  const session = await auth();

  return createServerSideHelpers({
    router: appRouter,
    ctx: {
      user: session?.user ?? null,
      ipIdentifier: "ssr",
      cookies: new Map<string, string>(),
    },
  });
});
