import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import {
  DevChecklistLauncher,
  type ChecklistTab,
} from "./dev-checklist-launcher";

// Server-side gate for the floating dev checklist launcher (B.PT75).
// Returns null for non-admins, so the markdown blobs + the launcher
// chrome never ship to non-admin clients.
//
// Reads N checklist files at request time (B.PT100 generalized the
// fixed-2-tab launcher into a per-tab array). Each entry pairs a
// tab label + per-tab localStorage scope + the markdown source.
// Order in the array = tab order in the modal; the launcher
// defaults to the first tab present.
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

  // Per-pass checklists ordered newest-first so the FAB opens on
  // the freshest list. Each new pass adds a row at the TOP. The
  // long-form catalog stays last because it's the slowest to scan
  // and least likely to be the user's daily-driver tab.
  //
  // `storageScope` keys the checked-state + scroll-position
  // localStorage so each tab's progress is independent. The All-
  // features tab uses the unscoped (default) keys to preserve any
  // existing user state from before B.PT87 split things into tabs.
  const tabSpecs: Array<{
    label: string;
    relativePath: string;
    storageScope?: string;
  }> = [
    {
      label: "2026-05-03",
      relativePath: "docs/qa-pass-2026-05-03-checklist.md",
      storageScope: "qa-05-03",
    },
    {
      label: "2026-05-02",
      relativePath: "docs/recent-changes-checklist.md",
      storageScope: "recent",
    },
    {
      label: "All features",
      relativePath: "docs/features-and-tests.md",
      // No storageScope — uses the original B.PT75 storage keys to
      // preserve existing user state across the addition of tabs.
    },
  ];

  const tabs: ChecklistTab[] = [];
  for (const spec of tabSpecs) {
    const markdown = safeRead(spec.relativePath);
    if (markdown === null) continue;
    tabs.push({
      id: spec.storageScope ?? "default",
      label: spec.label,
      markdown,
      storageScope: spec.storageScope,
    });
  }

  if (tabs.length === 0) return null;

  return <DevChecklistLauncher tabs={tabs} />;
}

function safeRead(relativePath: string): string | null {
  try {
    return readFileSync(join(process.cwd(), relativePath), "utf8");
  } catch {
    return null;
  }
}
