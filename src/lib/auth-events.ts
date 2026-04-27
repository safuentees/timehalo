import "server-only";
import { prisma } from "@/lib/prisma";

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
