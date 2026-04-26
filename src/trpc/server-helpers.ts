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
      ipIdentifier: "ssr",
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
    },
  });
});
