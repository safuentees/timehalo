import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { DevChecklistLauncher } from "./dev-checklist-launcher";

export async function DevChecklistMount() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) return null;

  const features = safeRead("docs/features-and-tests.md");
  const recent = safeRead("docs/recent-changes-checklist.md");
  if (features === null && recent === null) return null;

  return <DevChecklistLauncher features={features} recent={recent} />;
}

function safeRead(relativePath: string): string | null {
  try {
    return readFileSync(join(process.cwd(), relativePath), "utf8");
  } catch {
    return null;
  }
}
