import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminHandle } from "@/lib/admin";
import {
  DevChecklistLauncher,
  type ChecklistTab,
} from "./dev-checklist-launcher";

export async function DevChecklistMount() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true },
  });
  if (!isAdminHandle(me?.handle)) return null;

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
