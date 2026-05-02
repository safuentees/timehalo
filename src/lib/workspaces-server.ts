import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function generateInvitationToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

export async function redirectIfAliasedSlug(
  slug: string,
  subPath: "members" | "settings" | "event-types",
): Promise<void> {
  const current = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (current) return;

  const alias = await prisma.workspaceSlugHistory.findUnique({
    where: { oldSlug: slug },
    select: {
      workspace: { select: { slug: true } },
    },
  });
  if (!alias) return;

  redirect(`/workspaces/${alias.workspace.slug}/${subPath}`);
}
