import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { DevNotesLauncher } from "./dev-notes-launcher";

export async function DevNotesMount() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) return null;

  return <DevNotesLauncher />;
}
