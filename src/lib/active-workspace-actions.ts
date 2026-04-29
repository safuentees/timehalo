"use server";

import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { workspaceSlugSchema } from "@/lib/workspaces";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
} from "./active-workspace";

// Next 15 server action — clicked from the top-bar dropdown to flip
// the active workspace cookie. Membership is enforced server-side
// before the cookie write so a malicious client can't pin the UI to
// a workspace they don't belong to.
//
// Intentionally minimal return shape — the caller follows up with a
// router.refresh() (or navigation) to re-render with the new ctx.
// Return ok=false on rejection so the caller can show a toast and
// not navigate; throwing here would surface as a Next 15 error
// boundary, which is wrong for "you're not a member of that".

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

  // Membership check via the canonical Membership relation. The
  // workspaces.get procedure does the same thing inside its caller-
  // scope-aware tRPC middleware; we replicate the minimum here so
  // this action stays one-DB-roundtrip + doesn't need a tRPC caller.
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
    // No `secure` here — local dev is HTTP; in prod the proxy/edge
    // layer upgrades to https and the browser still sends the cookie.
    // If a future deploy needs strict secure-only, branch on
    // env.NEXT_PUBLIC_APP_URL.startsWith("https://").
  });

  return { ok: true };
}
