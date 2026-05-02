import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { DevChecklistLauncher } from "./dev-checklist-launcher";

// Server-side gate for the floating dev checklist launcher (B.PT75).
// Returns null for non-admins, so the markdown blob + the launcher
// chrome never ship to non-admin clients.
//
// `docs/features-and-tests.md` is read at request time via fs.readFileSync.
// On Vercel deploys, files outside `public/` need `outputFileTracing`
// to include them in the serverless bundle — Next picks up the read
// path automatically when the import graph reaches it. If the file is
// missing (different worktree, partial clone) the launcher silently
// drops, never surfacing as an error to the user.
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
