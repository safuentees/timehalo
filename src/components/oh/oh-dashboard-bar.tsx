"use client";

import { useState, useTransition } from "react";
import { Link } from "next-view-transitions";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";
import { OhUserMenu } from "./user-menu";

// Top bar above the dashboard sidebar+content row. Cal.com pattern:
// outer flex-col places this above .oh-app, which still owns the
// flex-row with sidebar + inset. Bar height comes from the existing
// --oh-dashboard-bar-height token (32px) — the sidebar's
// top: calc(var + 12px) already accounts for it.
//
// The bar is justify-between (CSS-side, .oh-dashboard-bar): workspace
// switcher anchors the start; Bookings + Settings icon-links + user
// menu anchor the end. The two icon-links pair with the gear so the
// host can swap the sidebar's nav set in one tap (`/settings/*` →
// settings sub-nav, anything else → main app nav, via
// navGroupsForPath in oh-app-sidebar.tsx).
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
      {/* Mobile sidebar opener. The shadcn Sidebar primitive renders a
          Sheet at <md and the trigger toggles its `openMobile` state.
          Hidden at md+ where the desktop sidebar rail owns its own
          collapse via the footer button. */}
      <SidebarTrigger
        aria-label="Open menu"
        className="-ml-1 mr-1 size-7 rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] hover:bg-[var(--oh-tint-hover)] hover:text-[color:var(--oh-ink)] md:hidden"
      />
      <Menu.Root>
        {/* Stable `id` prop bypasses Base UI's `useBaseUiId(idOverride)`
            useId fallback. Without it, the trigger's auto-id is
            positional (`base-ui-_R_xxxxx_`) and React 19's hydration
            counter can disagree between SSR and the first client paint
            when any earlier hook in the tree shifts the useId fiber
            position — surfaces as the "tree hydrated but some
            attributes of the server rendered HTML didn't match" error
            on the trigger's `id`. Reference: Base UI Menu docs
            "Multiple Triggers" (the `id` prop is the documented escape
            hatch for stable trigger IDs). */}
        <Menu.Trigger
          id="oh-workspace-switcher-trigger"
          className="oh-dashboard-bar-trigger"
          type="button"
        >
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
            // align="center" so the popup centers under the trigger.
            // On mobile (where the trigger is grid-centered in the
            // dashboard bar) this puts the popup in the viewport
            // center. On desktop the trigger sits at the bar's left
            // edge — Base UI's collision avoidance flips/shifts the
            // popup to keep it on-screen, so center is still the
            // safe default vs. start (which left-justifies the popup
            // and reads as off-balance now that the trigger isn't
            // hugging the left rail on mobile).
            align="center"
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

      <div className="flex items-center gap-2">
        <ChromeIconLink href="/bookings" label="Bookings" icon={CalendarCheck} />
        <ChromeIconLink href="/settings" label="Settings" icon={Settings} />
        <OhUserMenu />
      </div>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// Bare icon-link in the top-bar chrome. Matches the gear's affordance
// vocabulary so the bookings shortcut + settings entry read as a pair
// rather than two unrelated controls. Both swap the sidebar's nav set
// (via navGroupsForPath) when the route changes — `/settings/*` →
// settings sub-nav, anything else → main app nav. The bookings button
// is the counterpart for "leave settings, go back to the main view"
// and stays useful outside settings as a 1-tap home shortcut.
function ChromeIconLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-colors duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] hover:text-[color:var(--oh-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
    </Link>
  );
}
