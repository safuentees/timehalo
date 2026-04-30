"use client";

import { type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BrutalistAppSidebar } from "./brutalist-app-sidebar";
import { BrutalistDashboardBar } from "./brutalist-dashboard-bar";
import { useBrutalistPrefs } from "./prefs-context";

export function BrutalistDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density, motion } = useBrutalistPrefs();

  const insetClass = ["oh-root", motion ? "oh-motion" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <TooltipProvider delay={200}>
      <div
        className="oh-app-shell"
        data-typeface={typeface}
        data-density={density}
      >
        <BrutalistDashboardBar />
        <SidebarProvider className="oh-app">
          <BrutalistAppSidebar />
          <SidebarInset className={insetClass}>
            <div className="oh-host-content">
              <ScrollArea className="oh-host-content-inner">
                {children}
              </ScrollArea>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
