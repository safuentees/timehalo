import "server-only";
import { prisma } from "@/lib/prisma";

export function resolveAuthRedirect(input: { url: string; baseUrl: string }): string {
  const { url, baseUrl } = input;
  let target: string;
  if (url.startsWith("/")) {
    target = `${baseUrl}${url}`;
  } else {
    try {
      target = new URL(url).origin === baseUrl ? url : `${baseUrl}/bookings`;
    } catch {
      target = `${baseUrl}/bookings`;
    }
  }
  const path = new URL(target).pathname;
  if (path === "/" || path === "/login" || path === "/register") {
    return `${baseUrl}/bookings`;
  }
  return target;
}

export async function bootstrapUserWorkspace(user: {
  id: string;
  email: string | null;
}): Promise<void> {
  const existing = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        slug: `personal-${user.id}`,
        name: "Personal",
        ownerId: user.id,
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  });
}
