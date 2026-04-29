"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";

export function BrutalistDashboardBar() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const current = workspaces?.[0];
  const label = current?.name ?? "Workspaces";

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
                {(workspaces ?? []).map((w) => {
                  const isCurrent = current?.id === w.id;
                  return (
                    <Menu.Item
                      key={w.id}
                      className="bru-menu-item"
                      render={<Link href={`/workspaces/${w.slug}/members`} />}
                    >
                      <span className="bru-menu-item-glyph">
                        {isCurrent ? (
                          <Check
                            aria-hidden
                            strokeWidth={2}
                            className="size-3.5"
                          />
                        ) : null}
                      </span>
                      <span
                        className={
                          isCurrent ? "font-semibold" : "font-normal opacity-85"
                        }
                      >
                        {w.name}
                      </span>
                    </Menu.Item>
                  );
                })}
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
