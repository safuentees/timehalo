"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileEdit,
  Archive,
  Tag,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
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

const primaryNav = [
  { label: "Home", href: "/", icon: Home },
  { label: "Drafts", href: "/drafts", icon: FileEdit },
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Tags", href: "/tags", icon: Tag },
];

const secondaryNav = [
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

const menuButtonClasses =
  "relative rounded-none font-sans text-sm data-[active=true]:bg-foreground/[0.04] data-[active=true]:font-medium data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:inset-y-1.5 data-[active=true]:before:w-px data-[active=true]:before:bg-foreground data-[active=true]:group-data-[collapsible=icon]:before:inset-y-2 hover:bg-foreground/[0.03]";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-border">
        <div className="px-2 pt-4 pb-3 overflow-hidden transition-[max-height,padding] duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] max-h-24 group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:py-0">
          <h1 className="font-heading text-xl italic font-normal tracking-tight text-foreground leading-none whitespace-nowrap transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-data-[collapsible=icon]:opacity-0">
            Writing
          </h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-data-[collapsible=icon]:opacity-0">
            by santiago
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Library
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {primaryNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={menuButtonClasses}
                    render={
                      <Link href={item.href}>
                        <item.icon className="size-3.5 stroke-[1.5]" />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-3 my-2 h-px bg-linear-to-r from-transparent via-border to-transparent group-data-[collapsible=icon]:mx-2" />

        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={menuButtonClasses}
                    render={
                      <Link href={item.href}>
                        <item.icon className="size-3.5 stroke-[1.5]" />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={() => signOut({ redirectTo: "/login" })}
              className="rounded-none font-sans text-sm text-muted-foreground transition-colors duration-200 hover:bg-destructive/[0.06] hover:text-destructive"
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
