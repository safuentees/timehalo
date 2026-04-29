"use server";

import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { workspaceSlugSchema } from "@/lib/workspaces";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
} from "./active-workspace";

export async function setActiveWorkspace(input: {
  slug: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const slugCheck = workspaceSlugSchema.safeParse(input.slug);
  if (!slugCheck.success) {
    return { ok: false, reason: "invalid-slug" };
  }
  const slug = slugCheck.data;

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug },
    },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, reason: "not-a-member" };
  }

  const jar = await cookies();
  jar.set({
    name: ACTIVE_WORKSPACE_COOKIE,
    value: slug,
    path: "/",
    maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: false,
  });

  return { ok: true };
}
