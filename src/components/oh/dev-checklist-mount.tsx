import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import { DevChecklistLauncher } from "./dev-checklist-launcher";

// Server-side gate for the floating dev checklist launcher (B.PT75).
// Returns null for non-admins, so the markdown blobs + the launcher
// chrome never ship to non-admin clients.
//
// Reads BOTH checklist files at request time:
//   - `docs/features-and-tests.md` — the canonical "what's shipped +
//     how to verify" doc. Long-form, ~700 lines.
//   - `docs/recent-changes-checklist.md` — short-form, scoped to
//     the most recently shipped batch (currently the 2026-05-02 QA
//     pass + B.PT26 i18n sweep). Useful as a "what should I check
//     today" surface that doesn't drown the user in the full catalog.
//
// On Vercel deploys, files outside `public/` need `outputFileTracing`
// to include them in the serverless bundle — Next picks up the read
// path automatically when the import graph reaches it. If a file is
// missing (different worktree, partial clone) we drop that tab
// silently rather than crashing the launcher.
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
  // Both missing → no launcher. Either one present → mount with what
  // we have; the launcher gracefully renders only the available tab.
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
