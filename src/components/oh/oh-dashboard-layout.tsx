"use client";

import { type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OhAppSidebar } from "./oh-app-sidebar";
import { OhDashboardBar } from "./oh-dashboard-bar";
import { useOhPrefs } from "./prefs-context";

export function OhDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density, motion } = useOhPrefs();

  const insetClass = ["oh-root", motion ? "oh-motion" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <TooltipProvider delay={200}>
      <SidebarProvider
        className="oh-app-shell"
        data-typeface={typeface}
        data-density={density}
      >
        <OhDashboardBar />
        <div className="oh-app flex min-h-0 flex-1">
          <OhAppSidebar />
          <SidebarInset className={insetClass}>
            <div className="oh-host-content">
              <ScrollArea className="oh-host-content-inner">
                {children}
              </ScrollArea>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
