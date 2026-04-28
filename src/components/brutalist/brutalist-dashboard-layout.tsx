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
          {/* Only the page-content slot animates between routes. The
              sidebar lives in `root`, but `root` is given
              `animation: none` in globals.css, so persistent chrome
              never gets snapshotted into a transition — sidestepping the
              double-render artifacts (icon ghosting, doubled border
              strokes) that opt-out via view-transition-name was leaving
              behind. */}
          <div className="bru-host-content">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
