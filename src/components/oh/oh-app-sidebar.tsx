"use client";

import { useEffect, useRef } from "react";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useMounted } from "@/hooks/use-mounted";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { navGroupsForPath, type NavGroup } from "@/lib/brutalist";

gsap.registerPlugin(useGSAP);

// Mobile sidebar mode: content-replace, not Sheet drawer. Below the md
// breakpoint the desktop rail doesn't render (returns null below); the
// dashboard layout renders <MobileNavContent /> inside the content slot
// instead of the page when `openMobile` is true. This avoids the View
// Transitions API stacking conflict (Sheet drawer fighting the page-
// content snapshot for paint order) and matches the iOS-style "menu is
// a page" mental model — the sidebar trigger swaps the content area
// between the current page and the nav.

// Active state: left 2px ink accent + subtle tint bg. Hover: tint bg.
// Matches the original .oh-nav-item aesthetic, driven by data-[active=true]
// attributes set by shadcn's SidebarMenuButton.
//
// Collapsed (icon mode): drop the 2px left border. When the rail
// shrinks to ~32px, even a transparent 2px border-left reserves
// space inside the button's content box and pushes the icon 1px
// right of optical center. Active state in icon mode reads via
// bg tint alone — the left-rail indicator is for the expanded
// state where the label is the scan target.
const menuButtonClass = [
  "relative rounded-(--oh-r-xs)",
  "font-sans text-[13.5px] font-medium",
  "gap-[10px] px-[10px] py-[8px]",
  "border-l-2 border-l-transparent",
  "group-data-[collapsible=icon]:border-l-0",
  "transition-colors duration-150 ease-oh",
  "hover:bg-[var(--oh-tint-hover)]",
  "data-[active=true]:bg-[var(--oh-tint-active)]",
  "data-[active=true]:border-l-[var(--oh-ink)]",
  "data-[active=true]:font-bold",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2",
].join(" ");

const groupLabelClass =
  "font-[family:var(--oh-mono)] text-[10px] font-bold tracking-[2.5px] uppercase opacity-55 px-[10px] pb-[8px]";

function sidebarNavId(href: string) {
  const pathname = href.split(/[?#]/)[0] ?? href;
  const slug =
    pathname
      .split("/")
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9-]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "home";
  return `sidebar-nav-${slug}`;
}

export function OhAppSidebar() {
  // Pathname drives BOTH the active-row highlight AND which nav set
  // renders (main app vs. settings sub-nav). Active state must be
  // deferred to post-mount per commit 28a83c3 (Base UI Tooltip useId
  // hydration ordering); the nav SET itself is hydration-safe because
  // usePathname() is deterministic across SSR + first client render,
  // so navGroupsForPath() returns the same array on both passes.
  const pathname = usePathname();
  const mounted = useMounted();
  const { isMobile } = useSidebar();
  const activePath = mounted ? pathname : null;
  const groups = navGroupsForPath(pathname);

  // Mobile: don't render the Sidebar at all (no Sheet drawer). The
  // dashboard layout swaps the content slot to <MobileNavContent />
  // when `openMobile` is true. Until mount, useSidebar's `isMobile`
  // returns false (matches the SSR snapshot of the media query) — so
  // the desktop rail renders during SSR + first client paint and only
  // unmounts once the post-mount media query resolves true. This is
  // the standard SSR-safe pattern documented in `dashboard-forms.md`.
  if (isMobile) {
    return null;
  }

  return (
    <Sidebar
      collapsible="icon"
      // `will-change: width` on the gap + fixed container hints the
      // browser to promote them to a compositor layer for the 200ms
      // collapse transition. Without this, the layout reflow during
      // a thick (2px) brutalist border + position:fixed width
      // animation can drop frames on slower machines, which reads as
      // the sidebar "snapping" instead of sliding.
      className={[
        "oh-app-sidebar",
        "[&_[data-slot=sidebar-gap]]:will-change-[width]",
        "[&_[data-slot=sidebar-container]]:will-change-[width]",
      ].join(" ")}
    >
      <SidebarContent>
        {groups.map((group, index) => (
          <NavGroupRender
            key={group.label ?? `group-${index}`}
            group={group}
            activePath={activePath}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <FooterControls />
      </SidebarFooter>
    </Sidebar>
  );
}

// Mobile content-area nav. Mirrors OhAppSidebar's nav groups but
// without the Sidebar primitive shell (no rail width, no fixed
// positioning, no SidebarMenuButton's icon/expanded duality — at this
// width every row is full-width with the label visible). Rendered by
// OhDashboardLayout inside `oh-host-content-inner` when isMobile &&
// openMobile. Same `Link` from next-view-transitions so navigation
// runs through the existing transition machinery; the layout closes
// `openMobile` on pathname change so a tap drops into the new page.
//
// Motion (B.PT52 chisel pass):
// • Single `gsap.timeline({ paused: true })` built once on mount.
//   Played forward for entrance, reversed at timeScale 1.6 for exit
//   — the canonical "leave faster than you arrived" mirror that
//   makes the menu read as a designed unit, not an asymmetrical
//   half-finished one. The exit travels the same distance back to
//   the entrance start state but in ~62% of the entrance time.
// • Hierarchy in motion: group labels (tertiary chrome) get a
//   smaller travel + gentler ease + shorter duration than nav items
//   (the actionable target). Encodes the static design hierarchy in
//   the kinetic dimension. Same stagger cadence so they share
//   rhythm.
// • `gsap.matchMedia()` replaces a one-shot `window.matchMedia`
//   check — handles the user toggling the OS reduce-motion setting
//   mid-session, which the inline check missed.
// • Document-order stagger via the timeline's position parameter
//   (`i * 0.04`), not gsap's `stagger:` option, because we need
//   per-row durations + eases that gsap's stagger doesn't accept as
//   functions. Result: same visual cadence, more control.
//
// Lifecycle: ContentSlot mounts this when openMobile flips true and
// keeps it mounted past openMobile=false until `onExitComplete`
// fires. The `closing` prop drives the timeline direction; toggling
// closing from true→false mid-exit interrupts cleanly (gsap reverses
// the reverse — plays forward from current position).
export function MobileNavContent({
  closing,
  onExitComplete,
}: {
  closing: boolean;
  onExitComplete: () => void;
}) {
  const pathname = usePathname();
  const mounted = useMounted();
  const activePath = mounted ? pathname : null;
  const groups = navGroupsForPath(pathname);
  const container = useRef<HTMLElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const rows = gsap.utils.toArray<HTMLElement>(
          ".oh-mobile-nav-label, .oh-mobile-nav-item",
        );
        if (rows.length === 0) return;

        const tl = gsap.timeline({ paused: true });
        rows.forEach((row, i) => {
          const isLabel = row.classList.contains("oh-mobile-nav-label");
          tl.fromTo(
            row,
            { opacity: 0, y: isLabel ? -4 : -10 },
            {
              opacity: 1,
              y: 0,
              duration: isLabel ? 0.22 : 0.28,
              ease: isLabel ? "power1.out" : "power3.out",
            },
            // Position parameter: each row starts at i * 0.04s into
            // the timeline. Document-order stagger; reverse plays
            // them out in reverse order automatically.
            i * 0.04,
          );
        });
        tlRef.current = tl;
        tl.play();
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        // No animation: reduce-motion users see the nav arrive
        // instantly at its natural state. The `closing` effect below
        // also short-circuits exit when no timeline exists, so it
        // calls onExitComplete synchronously when the layout sets
        // closing=true.
        tlRef.current = null;
      });

      return () => mm.revert();
    },
    { scope: container },
  );

  // Drive the timeline's direction from the `closing` prop. Forward
  // play (timescale 1) on mount + on re-open during an in-flight
  // exit; reverse (timescale 1.6) on close. `onReverseComplete` is
  // the unmount signal; the layout removes us from the DOM after.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
      // Reduced-motion path — no timeline exists. Fire the unmount
      // signal synchronously so the layout doesn't leave us
      // mounted forever.
      if (closing) onExitComplete();
      return;
    }

    if (closing) {
      tl.timeScale(1.6);
      tl.eventCallback("onReverseComplete", onExitComplete);
      tl.reverse();
    } else {
      tl.timeScale(1);
      tl.eventCallback("onReverseComplete", null);
      tl.play();
    }
  }, [closing, onExitComplete]);

  return (
    <nav
      ref={container}
      aria-label="Main"
      // Marker for the View Transitions opt-out rule in globals.css.
      // When this nav is mounted, `:has([data-oh-mobile-menu="true"])`
      // drops `oh-host-content-inner`'s view-transition-name so the
      // route-change cross-fade doesn't conflict with the GSAP exit
      // animation. Same structural pattern as commit 898cef8 used for
      // the Sheet drawer; selector updated for the inline-menu case.
      data-oh-mobile-menu="true"
      className="flex flex-col gap-6 px-4 py-6 sm:px-6"
    >
      {groups.map((group, index) => (
        <div key={group.label ?? `mobile-group-${index}`}>
          {group.label ? (
            <p className="oh-mobile-nav-label oh-eyebrow opacity-55 mb-3">
              {group.label}
            </p>
          ) : null}
          <ul role="list" className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active =
                activePath !== null &&
                (activePath === item.href ||
                  (item.href !== "/" &&
                    activePath.startsWith(`${item.href}/`)));
              return (
                <li key={item.href} className="oh-mobile-nav-item">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-(--oh-r-xs) px-3 py-3 text-[15px] font-medium",
                      "border-l-2 border-l-transparent",
                      "transition-colors duration-150 ease-oh",
                      "hover:bg-[var(--oh-tint-hover)]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2",
                      active
                        ? "bg-[var(--oh-tint-active)] border-l-[var(--oh-ink)] font-bold"
                        : "",
                    ].join(" ")}
                  >
                    <item.icon
                      aria-hidden
                      strokeWidth={1.5}
                      className="size-5 shrink-0"
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavGroupRender({
  group,
  activePath,
}: {
  group: NavGroup;
  activePath: string | null;
}) {
  return (
    <SidebarGroup>
      {group.label ? (
        <SidebarGroupLabel className={groupLabelClass}>
          {group.label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {group.items.map((item) => {
            // Active when the route exactly matches OR is a child of
            // the nav target. Lets `/settings/general/whatever` keep
            // the General row lit even on a sub-page. The `/` root
            // exception avoids every row matching when href === "/".
            const active =
              activePath !== null &&
              (activePath === item.href ||
                (item.href !== "/" &&
                  activePath.startsWith(`${item.href}/`)));
            return (
              <SidebarMenuItem key={item.href} className="group/item">
                <SidebarMenuButton
                  id={sidebarNavId(item.href)}
                  isActive={active}
                  tooltip={item.label}
                  className={menuButtonClass}
                  render={
                    <Link href={item.href}>
                      <item.icon
                        aria-hidden
                        strokeWidth={1.5}
                        className="size-4 shrink-0"
                      />
                      <span>{item.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// Sidebar collapse trigger. Bare native button — no Button component,
// no variant baggage, no hover state. Just an icon that toggles.
function FooterControls() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
      className="inline-flex size-9 items-center justify-center text-oh-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-oh-ink focus-visible:outline-offset-2 [&_svg]:size-4"
    >
      <PanelLeft strokeWidth={1.5} />
    </button>
  );
}
