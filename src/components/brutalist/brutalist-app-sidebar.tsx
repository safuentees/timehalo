"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { HalftoneMark } from "@/components/brand/halftone-mark";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/brutalist";

// Active state: left 2px ink accent + subtle tint bg. Hover: tint bg.
// Matches the original .bru-nav-item aesthetic, driven by data-[active=true]
// attributes set by shadcn's SidebarMenuButton.
const menuButtonClass = [
  "relative rounded-(--bru-r-xs)",
  "font-sans text-[13.5px] font-medium",
  "gap-[10px] px-[10px] py-[8px]",
  "border-l-2 border-l-transparent",
  "transition-colors duration-150 ease-bru",
  "hover:bg-[var(--bru-tint-hover)]",
  "data-[active=true]:bg-[var(--bru-tint-active)]",
  "data-[active=true]:border-l-[var(--bru-ink)]",
  "data-[active=true]:font-bold",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2",
].join(" ");

const groupLabelClass =
  "font-[family:var(--bru-mono)] text-[10px] font-bold tracking-[2.5px] uppercase opacity-55 px-[10px] pb-[8px]";

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


export function BrutalistAppSidebar() {
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
      className="bru-app-sidebar"
    >
      <SidebarHeader className="px-4 pt-5 pb-8">
        <div className="bru-brand">
          <HalftoneMark size={32} className="bru-brand-mark" />
          <div className="bru-brand-name">
            <div>OFFICEHOURS</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-[22px]">
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>
            LIBRARY
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {PRIMARY_NAV.map((item) => {
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
            <SidebarMenu className="gap-0">
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

      <SidebarRail />
    </Sidebar>
  );
}

// Sidebar collapse trigger. Theme toggle + sign-out parked for now
// per 2026-04-28 request — they'll come back when the surface is
// stable. Border is intentionally transparent so the icon sits
// flush in the footer instead of reading as a button card.
function FooterControls() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <div className="flex flex-row items-center gap-1 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0.5 group-data-[collapsible=icon]:px-0">
      <Button
        type="button"
        variant="brutalistGhost"
        size="brutalistIcon"
        onClick={toggleSidebar}
        aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
        className="rounded-(--bru-r-xs) border-transparent hover:border-transparent"
      >
        <PanelLeft />
      </Button>
    </div>
  );
}
