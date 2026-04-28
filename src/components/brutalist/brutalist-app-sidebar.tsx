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

const menuButtonClass = [
  "relative rounded-(--bru-r-xs)",
  "font-sans text-[13.5px] font-medium",
  "gap-[10px] px-[10px] py-[8px]",
  "border-l-2 border-l-transparent",
  "group-data-[collapsible=icon]:border-l-0",
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
  const pathname = usePathname();
  const mounted = useMounted();
  const activePath = mounted ? pathname : null;

  return (
    <Sidebar
      collapsible="icon"
      className={[
        "bru-app-sidebar",
        "[&_[data-slot=sidebar-gap]]:will-change-[width]",
        "[&_[data-slot=sidebar-container]]:will-change-[width]",
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

      <SidebarFooter>
        <FooterControls />
      </SidebarFooter>

    </Sidebar>
  );
}

function FooterControls() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
      className="inline-flex size-9 items-center justify-center text-bru-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-bru-ink focus-visible:outline-offset-2 [&_svg]:size-4"
    >
      <PanelLeft strokeWidth={1.5} />
    </button>
  );
}
