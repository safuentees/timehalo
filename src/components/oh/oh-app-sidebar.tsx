"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HalftoneMark } from "@/components/brand/halftone-mark";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/brutalist";

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
  "transition-colors duration-150 ease-bru",
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
  // Pathname-driven active state must be deferred to post-mount.
  // Re-applies the fix from commit 28a83c3 — Next 16's hydration
  // ordering means usePathname() returning the same value on server
  // and client doesn't matter; the React tree shape can still differ
  // by a beat, which causes Base UI's Tooltip useId() calls to land
  // at different positions and produces the hydration warning the
  // Playwright suite catches on /settings.
  //
  // Server + first client paint render with active=false everywhere;
  // the real active highlight lights up immediately after mount.
  // Brief absence of the active style is far cheaper than a hydration
  // bailout that strips event handlers from the entire sidebar.
  const pathname = usePathname();
  const mounted = useMounted();
  const activePath = mounted ? pathname : null;

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
      {/* <SidebarHeader className="px-4 pt-5 pb-8">
        <div className="oh-brand">
          <HalftoneMark size={32} className="oh-brand-mark" />
          <div className="oh-brand-name">
            <div>OFFICEHOURS</div>
          </div>
        </div>
      </SidebarHeader> */}

      <SidebarContent>
        {/* Bookings — the canonical destination, sits alone above
            LIBRARY with no eyebrow. The first thing the host sees
            when they open the dashboard is the thing they'd most
            often want to act on. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {PRIMARY_NAV.slice(0, 1).map((item) => {
                const active = activePath === item.href;
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

        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>
            LIBRARY
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {PRIMARY_NAV.slice(1).map((item) => {
                const active = activePath === item.href;
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

        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>
            WORKSPACE
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {SECONDARY_NAV.map((item) => {
                const active = activePath === item.href;
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
      </SidebarContent>

      <SidebarFooter>
        <FooterControls />
      </SidebarFooter>
    </Sidebar>
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
