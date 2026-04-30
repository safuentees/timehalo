"use client";

import { useState, useTransition } from "react";
import { Link } from "next-view-transitions";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";

// Top bar above the dashboard sidebar+content row. Cal.com pattern:
// outer flex-col places this above .oh-app, which still owns the
// flex-row with sidebar + inset. Bar height comes from the existing
// --oh-dashboard-bar-height token (32px) — the sidebar's
// top: calc(var + 12px) already accounts for it.
//
// Trigger: the active workspace name (the row with isActive=true,
// which the server-side workspaces.list resolves from the
// `oh_active_workspace` cookie — B.PT6 — falling back to the first
// row when the cookie is unset or stale). Click opens a Base UI
// Menu with one row per workspace; clicking a row writes the cookie
// via the setActiveWorkspace server action, then `utils.invalidate()`
// (broad — every workspace-aware query re-fetches with the new
// ctx; B.PT17), `router.refresh()` (re-runs RSC + SSR prefetches),
// and a smart `router.push` that rewrites the slug segment in place
// when the current path is bound to the old workspace and stays put
// everywhere else.
export function OhDashboardBar() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();
  const utils = trpc.useUtils();

  const current = workspaces?.find((w) => w.isActive) ?? workspaces?.[0];
  const label = current?.name ?? "Workspaces";

  function handlePick(slug: string) {
    const oldSlug = current?.slug;
    startTransition(async () => {
      const result = await setActiveWorkspace({ slug });
      if (!result.ok) {
        toast.error("Couldn't switch workspace.");
        return;
      }
      // Broad invalidation (B.PT17). Without this, any client-cached
      // tRPC query (api-keys.list, billing.currentPlan, eventTypes,
      // bookings.listForHost) keeps showing the prior workspace's
      // data until staleTime expires. The trade-off is a brief refetch
      // of every mounted query — acceptable, since the workspace
      // switch is a deliberate user action.
      await utils.invalidate();
      // Re-runs server components + SSR prefetches so per-section
      // server-resolved data reflects the new active workspace.
      router.refresh();
      // Smart navigation: only push when the current path is bound
      // to the old workspace's slug (e.g. /workspaces/<oldSlug>/...).
      // Otherwise stay — the user picked a switcher action, not a
      // navigation, and ejecting them off /bookings or /settings
      // every time would feel like a teleport.
      const next = oldSlug
        ? nextHrefAfterWorkspaceSwitch(pathname ?? "", oldSlug, slug)
        : null;
      if (next) router.push(next);
    });
  }

  return (
    <div className="oh-dashboard-bar">
      <Menu.Root>
        <Menu.Trigger className="oh-dashboard-bar-trigger" type="button">
          <span className="oh-dashboard-bar-label">{label}</span>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="oh-dashboard-bar-chevron size-3 opacity-55"
          />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="oh-menu-positioner"
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
            <Menu.Popup className="oh-menu-popup">
              <Menu.Group>
                <Menu.GroupLabel className="oh-menu-label">
                  Workspaces
                </Menu.GroupLabel>
                {(workspaces ?? []).map((w) => (
                  <Menu.Item
                    key={w.id}
                    className="oh-menu-item"
                    onClick={() => handlePick(w.slug)}
                  >
                    <span className="oh-menu-item-glyph">
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

              <Menu.Separator className="oh-menu-separator" />

              <Menu.Item
                className="oh-menu-item"
                onClick={() => setCreateOpen(true)}
              >
                <span className="oh-menu-item-glyph">
                  <Plus aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>Create workspace</span>
              </Menu.Item>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/workspaces" />}
              >
                <span className="oh-menu-item-glyph">
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
