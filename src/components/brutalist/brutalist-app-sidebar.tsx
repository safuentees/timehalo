"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
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
  SidebarRail,
  SidebarTrigger,
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
      variant="floating"
      className={[
        "bru-app-sidebar",
        // The inner is shadcn's rounded card surface. Drop the soft
        // shadow + faint ring (stock shadcn vocabulary) and replace
        // with a thick brutalist border. Inner already carries
        // `bg-sidebar` (= --bru-paper in our theme) and `size-full`,
        // so the rounded surface fills the full viewport height
        // regardless of how many nav items live inside.
        "[&_[data-slot=sidebar-inner]]:shadow-none",
        "[&_[data-slot=sidebar-inner]]:ring-0",
        "[&_[data-slot=sidebar-inner]]:border-2",
        "[&_[data-slot=sidebar-inner]]:border-bru-line-strong",
      ].join(" ")}
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

      <SidebarFooter className="border-t border-[var(--bru-line-soft)]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              id="sidebar-action-sign-out"
              tooltip="Sign out"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="rounded-(--bru-r-xs) font-sans text-[12.5px] opacity-65 hover:opacity-100 transition-opacity duration-150 ease-bru focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2"
            >
              <LogOut className="size-3.5 stroke-[1.5]" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Collapse trigger lives at the bottom of the sidebar so the
            chrome stays inside the surface. In icon mode it stays
            visible (footer is part of the icon-width column). On
            mobile the sheet has its own close mechanics; the topbar
            keeps a hamburger to open it. */}
        <SidebarTrigger
          aria-label="Toggle sidebar"
          className="mt-1 hidden h-8 w-full justify-start gap-2 rounded-(--bru-r-xs) px-[10px] font-sans text-[12.5px] opacity-65 transition-opacity duration-150 ease-bru hover:bg-[var(--bru-tint-hover)] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2 md:flex group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
