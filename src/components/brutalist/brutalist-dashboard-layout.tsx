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

  const insetClass = ["bru-root", motion ? "bru-motion" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <TooltipProvider delay={200}>
      <div
        className="bru-app-shell"
        data-typeface={typeface}
        data-density={density}
      >
        <BrutalistDashboardBar />
        <SidebarProvider className="bru-app">
          <BrutalistAppSidebar />
          <SidebarInset className={insetClass}>
            <div className="bru-host-content">
              <ScrollArea className="bru-host-content-inner">
                {children}
              </ScrollArea>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
