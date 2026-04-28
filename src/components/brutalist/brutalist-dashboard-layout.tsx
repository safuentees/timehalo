"use client";

import { type ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrutalistAppSidebar } from "./brutalist-app-sidebar";
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
      <SidebarProvider
        className="bru-app"
        data-typeface={typeface}
        data-density={density}
      >
        <BrutalistAppSidebar />
        <SidebarInset className={insetClass}>
          {/* Two layers:
              - .bru-host-content owns the static visual frame
                (paper bg, rounded corners, margin from the cream
                frame). NO view-transition-name — it stays put across
                route changes.
              - .bru-host-content-inner is the view-transition
                target. Transparent, just a wrapper for children;
                snapshot animates only the rendered children, the
                white panel underneath stays solid. */}
          <div className="bru-host-content">
            <div className="bru-host-content-inner">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
