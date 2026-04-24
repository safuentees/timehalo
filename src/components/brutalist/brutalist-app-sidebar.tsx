"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { LAB_NAV, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/brutalist";

// Active state: left 2px ink accent + subtle tint bg. Hover: tint bg.
// Matches the original .bru-nav-item aesthetic, driven by data-[active=true]
// attributes set by shadcn's SidebarMenuButton.
const menuButtonClass = [
  "relative rounded-(--bru-r-xs)",
  "font-sans text-[13.5px] font-medium",
  "gap-[10px] px-[10px] py-[8px]",
  "border-l-2 border-l-transparent",
  "transition-colors duration-[80ms] [transition-timing-function:steps(1)]",
  "hover:bg-[var(--bru-tint-hover)]",
  "data-[active=true]:bg-[var(--bru-tint-active)]",
  "data-[active=true]:border-l-[var(--bru-ink)]",
  "data-[active=true]:font-bold",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2",
].join(" ");

const groupLabelClass =
  "font-[family:var(--bru-mono)] text-[10px] font-bold tracking-[2.5px] uppercase opacity-55 px-[10px] pb-[8px]";

function NavBullet({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        "inline-block size-[6px] shrink-0",
        "bg-[var(--bru-ink)]",
        "transition-[opacity,transform] duration-[120ms] [transition-timing-function:cubic-bezier(.2,.9,.2,1)]",
        active ? "opacity-100 scale-[1.2]" : "opacity-35 group-hover/item:opacity-85",
      ].join(" ")}
    />
  );
}

export function BrutalistAppSidebar() {
  // Defer pathname-derived active state until after mount. Next.js 16
  // can prerender a static shell where usePathname returns a stub value,
  // so reading it during SSR-then-hydrate causes a `data-active` mismatch
  // on the sidebar links. React then bails out of hydrating this subtree,
  // which leaves adjacent buttons (topbar, + NEW POST) without their
  // event handlers — which is the "button does nothing" symptom.
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activePath = mounted ? pathname : null;

  return (
    <Sidebar
      collapsible="offcanvas"
      className="bru-app-sidebar border-r-0"
    >
      <SidebarHeader className="px-4 pt-5 pb-8">
        <div className="bru-brand">
          <div className="bru-monogram">N</div>
          <div className="bru-brand-name">
            <div>NICO</div>
            <div className="bru-brand-sub">WRITING</div>
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
                      isActive={active}
                      tooltip={item.label}
                      className={menuButtonClass}
                      render={
                        <Link href={item.href}>
                          <NavBullet active={active} />
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
                      isActive={active}
                      tooltip={item.label}
                      className={menuButtonClass}
                      render={
                        <Link href={item.href}>
                          <NavBullet active={active} />
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
            LAB
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {LAB_NAV.map((item) => {
                const active = activePath === item.href;
                return (
                  <SidebarMenuItem key={item.href} className="group/item">
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className={menuButtonClass}
                      render={
                        <Link href={item.href}>
                          <NavBullet active={active} />
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
              tooltip="Sign out"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="rounded-(--bru-r-xs) font-sans text-[12.5px] opacity-65 hover:opacity-100 transition-opacity duration-[80ms] [transition-timing-function:steps(1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bru-ink)] focus-visible:outline-offset-2"
            >
              <LogOut className="size-3.5 stroke-[1.5]" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
