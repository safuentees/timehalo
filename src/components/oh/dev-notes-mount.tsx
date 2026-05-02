import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { DevNotesLauncher } from "./dev-notes-launcher";

// Server-side admin gate for the floating dev notes launcher (B.PT79).
// Same shape as `DevChecklistMount` — admin handle check, returns null
// for non-admins so the launcher chrome never ships to non-admin
// clients. Mounted alongside `<DevChecklistMount />` in the host
// layout; the two FABs sit side-by-side at the top-left.
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
