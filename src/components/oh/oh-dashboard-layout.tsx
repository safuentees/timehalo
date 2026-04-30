"use client";

import { type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OhAppSidebar } from "./oh-app-sidebar";
import { OhDashboardBar } from "./oh-dashboard-bar";
import { useOhPrefs } from "./prefs-context";

// SidebarProvider is the OUTER wrapper now — it owns the sidebar
// context (open/openMobile/toggleSidebar) and a sheet-portal for the
// mobile drawer. Lifting it above the dashboard bar lets the bar
// render a `<SidebarTrigger>` at <md so the mobile sheet has an
// opener. Cal.com `Shell.tsx` follows the same pattern: provider at
// the top, top bar inside, sidebar+inset row underneath. Audit
// finding `§2.1 / §4.1 — mobile sidebar unreachable`.
//
// The shell is column-flex (oh-app-shell). The row container below the
// bar (oh-app) carries the row-flex + sidebar token aliases that were
// previously on the SidebarProvider's wrapper.
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
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
