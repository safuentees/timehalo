"use client";

import { useState, useTransition } from "react";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";

export function BrutalistDashboardBar() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();
  const utils = trpc.useUtils();

  const current = workspaces?.find((w) => w.isActive) ?? workspaces?.[0];
  const label = current?.name ?? "Workspaces";

  function handlePick(slug: string) {
    startTransition(async () => {
      const result = await setActiveWorkspace({ slug });
      if (!result.ok) {
        toast.error("Couldn't switch workspace.");
        return;
      }
      await utils.workspaces.list.invalidate();
      router.refresh();
      router.push(`/workspaces/${slug}/members`);
    });
  }

  return (
    <div className="bru-dashboard-bar">
      <Menu.Root>
        <Menu.Trigger className="bru-dashboard-bar-trigger" type="button">
          <span className="bru-dashboard-bar-label">{label}</span>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="bru-dashboard-bar-chevron size-3 opacity-55"
          />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="bru-menu-positioner"
            sideOffset={8}
            align="start"
            alignOffset={-8}
            style={{ zIndex: 100 }}
          >
            <Menu.Popup className="bru-menu-popup">
              <Menu.Group>
                <Menu.GroupLabel className="bru-menu-label">
                  Workspaces
                </Menu.GroupLabel>
                {(workspaces ?? []).map((w) => (
                  <Menu.Item
                    key={w.id}
                    className="bru-menu-item"
                    onClick={() => handlePick(w.slug)}
                  >
                    <span className="bru-menu-item-glyph">
                      {w.isActive ? (
                        <Check
                          aria-hidden
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      ) : null}
                    </span>
                    <span
                      className={
                        w.isActive
                          ? "font-semibold"
                          : "font-normal opacity-85"
                      }
                    >
                      {w.name}
                    </span>
                  </Menu.Item>
                ))}
              </Menu.Group>

              <Menu.Separator className="bru-menu-separator" />

              <Menu.Item
                className="bru-menu-item"
                onClick={() => setCreateOpen(true)}
              >
                <span className="bru-menu-item-glyph">
                  <Plus aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>Create workspace</span>
              </Menu.Item>
              <Menu.Item
                className="bru-menu-item"
                render={<Link href="/workspaces" />}
              >
                <span className="bru-menu-item-glyph">
                  <Settings aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>Manage workspaces</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
