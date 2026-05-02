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

  let markdown: string;
  try {
    markdown = readFileSync(
      join(process.cwd(), "docs", "features-and-tests.md"),
      "utf8",
    );
  } catch {
    return null;
  }

  return <DevChecklistLauncher markdown={markdown} />;
}
