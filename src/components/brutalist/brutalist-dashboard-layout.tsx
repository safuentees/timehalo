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

  // Outer flex-col: the dashboard bar sits above the sidebar+content
  // row. Cal.com's Shell.tsx pattern — single column at viewport
  // height, banner / bar as the first child, the dashboard's own
  // flex-row as the second. data-typeface lifts to the shell so the
  // bar inherits the same typography as the rest of the surface.
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
            {/* Two layers:
                - .oh-host-content owns the static visual frame
                  (paper bg, rounded corners, margin from the cream
                  frame). NO view-transition-name — it stays put across
                  route changes.
                - .oh-host-content-inner is the view-transition
                  target. Transparent, just a wrapper for children;
                  snapshot animates only the rendered children, the
                  white panel underneath stays solid. */}
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
