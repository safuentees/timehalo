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

// Top bar above the dashboard sidebar+content row. Cal.com pattern:
// outer flex-col places this above .bru-app, which still owns the
// flex-row with sidebar + inset. Bar height comes from the existing
// --oh-dashboard-bar-height token (32px) — the sidebar's
// top: calc(var + 12px) already accounts for it.
//
// Trigger: the active workspace name (the row with isActive=true,
// which the server-side workspaces.list resolves from the
// `oh_active_workspace` cookie — B.PT6 — falling back to the first
// row when the cookie is unset or stale). Click opens a Base UI
// Menu with one row per workspace; clicking a row writes the cookie
// via the setActiveWorkspace server action, then router.refresh()
// so other workspace-aware surfaces (settings, billing, api-keys,
// workflow plan-gate) re-read the new active context. We also
// navigate to the chosen workspace's members page so the user lands
// somewhere meaningful.
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
      // Invalidate the list query so any consumer sees the new
      // isActive row immediately. router.refresh() re-fetches RSC
      // data + re-runs SSR prefetches so /settings + /workspaces
      // reflect the new context on the next render.
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
            // Inline z-index as belt-and-suspenders: the sidebar
            // primitive's [data-slot="sidebar-container"] is
            // position: fixed; z-index: 10. Base UI's Positioner is
            // body-portaled but ships no z-index. Inline beats
            // any CSS specificity surprises and tolerates Turbopack
            // CSS-cache hiccups in dev.
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
