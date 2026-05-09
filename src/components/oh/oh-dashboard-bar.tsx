"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu } from "@base-ui/react/menu";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/hooks";
import { setActiveWorkspace } from "@/lib/active-workspace-actions";
import { nextHrefAfterWorkspaceSwitch } from "@/lib/active-workspace";
import { WorkspaceCreateDialog } from "@/app/(host)/workspaces/components/workspace-create-dialog";
import { DashboardTransitionLink } from "./dashboard-route-transition";
import { OhMenuTrigger } from "./oh-menu-trigger";
import { OhTopProgressBar } from "./oh-top-progress-bar";
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
  const t = useTranslations("Chrome");
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  // B.PT84 — track WHICH slug the user just picked so the trigger
  // label can render optimistically while the cookie write +
  // invalidation + refresh resolve. Without this, the trigger keeps
  // showing the OLD workspace name until `workspaces.list` refetches
  // — the exact mismatch QA-3 reports. Held alongside isPending so
  // both reset when the transition closes.
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const utils = trpc.useUtils();

  const current = workspaces?.find((w) => w.isActive) ?? workspaces?.[0];
  const pendingWorkspace =
    pendingSlug != null
      ? workspaces?.find((w) => w.slug === pendingSlug) ?? null
      : null;
  // Optimistic label — show the picked workspace's name the moment the
  // user clicks. Falls back to current when nothing's pending. The
  // workspace MUST already be in the dropdown's list (membership-
  // gated; the row is what they clicked) so this never reads empty.
  const label =
    (pendingWorkspace ?? current)?.name ?? t("workspaceSwitcherFallback");

  function handlePick(slug: string) {
    const oldSlug = current?.slug;
    // Early-return when picking the already-active workspace. Without
    // this, the click still wires up isPending → progress bar flash
    // for ~50ms even though no data actually changes.
    if (oldSlug === slug) return;
    setPendingSlug(slug);
    startTransition(async () => {
      try {
        const result = await setActiveWorkspace({ slug });
        if (!result.ok) {
          toast.error(t("switchWorkspaceError"));
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
      } finally {
        setPendingSlug(null);
      }
    });
  }

  return (
    <div className="oh-dashboard-bar">
      {/* Mobile menu opener. Toggles `openMobile` on the SidebarProvider
          context; the dashboard layout swaps the content slot to the
          inline mobile nav (B.PT49) when openMobile flips true.
          Hidden at md+ where the desktop sidebar rail owns its own
          collapse via the footer button.
          The icon morphs hamburger ↔ X via GSAP MorphSVG (B.PT52
          motion vocabulary applied to a single-element morph). */}
      <OhMenuTrigger className="-ml-1 mr-1 md:hidden" />
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
          // B.PT84 — `aria-busy` so AT users hear the trigger as
          // "in progress" while the switch resolves. Pairs with
          // the `<OhTopProgressBar>` aria-live announcement.
          aria-busy={isPending || undefined}
          data-pending={isPending || undefined}
          // Mobile dashboard-bar grid slot — pinned to column 2.
          data-bar-slot="center"
        >
          <span className="oh-dashboard-bar-label">{label}</span>
          {isPending ? (
            <Loader2
              aria-hidden
              strokeWidth={2}
              className="oh-dashboard-bar-chevron size-3 opacity-55 animate-spin"
            />
          ) : (
            <ChevronDown
              aria-hidden
              strokeWidth={1.75}
              className="oh-dashboard-bar-chevron size-3 opacity-55"
            />
          )}
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
                  {t("workspaceSwitcherGroupLabel")}
                </Menu.GroupLabel>
                {(workspaces ?? []).map((w) => {
                  const isPicked = pendingSlug === w.slug;
                  return (
                    <Menu.Item
                      key={w.id}
                      className="oh-menu-item"
                      // B.PT84 — block re-entry while a switch is in
                      // flight. Without this the user can stack picks
                      // and the optimistic label race-conditions
                      // against the actual cookie write.
                      disabled={isPending}
                      data-pending={isPicked || undefined}
                      onClick={() => handlePick(w.slug)}
                    >
                      <span className="oh-menu-item-glyph">
                        {isPicked ? (
                          <Loader2
                            aria-hidden
                            strokeWidth={2}
                            className="size-3.5 animate-spin opacity-70"
                          />
                        ) : w.isActive ? (
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
                  );
                })}
              </Menu.Group>

              <Menu.Separator className="oh-menu-separator" />

              <Menu.Item
                className="oh-menu-item"
                onClick={() => setCreateOpen(true)}
              >
                <span className="oh-menu-item-glyph">
                  <Plus aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>{t("createWorkspace")}</span>
              </Menu.Item>
              <Menu.Item
                className="oh-menu-item"
                render={<Link href="/workspaces" />}
              >
                <span className="oh-menu-item-glyph">
                  <Settings aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <span>{t("manageWorkspaces")}</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Mobile dashboard-bar grid slot — pinned to column 3. The
          `data-bar-slot` marker keeps the icons + avatar justified to
          the bar's right edge regardless of how many UNMARKED
          siblings (OhTopProgressBar during a switch, dialog stubs,
          etc) the bar gains at runtime. */}
      <div data-bar-slot="end" className="flex items-center gap-2">
        <ChromeIconLink
          href="/bookings"
          label={t("bookingsAria")}
          icon={CalendarCheck}
        />
        <ChromeIconLink
          href="/settings"
          label={t("settingsAria")}
          icon={Settings}
        />
        <OhUserMenu />
      </div>

      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {/* B.PT84 — top progress affordance for QA-3. Mounts only while
          the workspace-switch transition is in flight; unmounts the
          moment isPending flips false. Rendered as the LAST child
          so it sits above the bar in the document order without
          needing a portal. */}
      <OhTopProgressBar visible={isPending} />
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
    <DashboardTransitionLink
      href={href}
      aria-label={label}
      // Solid ink color + opacity-on-SVG (not alpha-color on parent)
      // so lucide stroke intersections don't compose double-alpha
      // and look darker than the rest of the lines. opacity-[0.55]
      // matches `--oh-content-muted`'s 55% perceived dimness; hover
      // lifts to opacity-100 in sync with the bg-tint reveal.
      className="oh-focus-ring group/chrome inline-flex size-7 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-ink)] transition-colors duration-150 ease-oh hover:bg-[var(--oh-tint-hover)] [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-oh group-hover/chrome:[&_svg]:opacity-100 hover:[&_svg]:opacity-100"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
    </DashboardTransitionLink>
  );
}
