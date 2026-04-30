"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobileNavContent, OhAppSidebar } from "./oh-app-sidebar";
import { OhDashboardBar } from "./oh-dashboard-bar";
import { useOhPrefs } from "./prefs-context";

// SidebarProvider is the OUTER wrapper — it owns the sidebar context
// (open/openMobile/toggleSidebar) and used to own a sheet-portal for
// the mobile drawer. Lifting it above the dashboard bar lets the bar
// render a `<SidebarTrigger>` at <md so the mobile menu has an opener.
// Cal.com `Shell.tsx` follows the same pattern: provider at the top,
// top bar inside, sidebar+inset row underneath.
//
// Mobile mode (B.PT49 follow-up): the Sheet drawer is gone. At <md,
// `<OhAppSidebar />` returns null, and `<MobileShell />` swaps the
// content slot between the active page (`{children}`) and
// `<MobileNavContent />` based on `openMobile`. This avoids the View
// Transitions API stacking conflict the Sheet drawer caused, and
// matches the iOS-style mental model where the menu IS the page.
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
                <ContentSlot>{children}</ContentSlot>
              </ScrollArea>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

// Decides whether the content slot shows the page or the mobile nav.
// Lives inside the SidebarProvider so it can read the context.
function ContentSlot({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();

  // Auto-close the mobile menu on route change. Without this the user
  // would tap a nav link, navigate, and the new page would still be
  // hidden behind the menu (openMobile is in React state across
  // navigation). Watching pathname covers both Link clicks and
  // programmatic router.push from inside the nav.
  useEffect(() => {
    if (openMobile) {
      setOpenMobile(false);
    }
    // pathname is the only signal we want to react to here; including
    // openMobile/setOpenMobile in deps would re-fire the effect when
    // the menu closes (no-op but noisy). Pathname is stable across
    // re-renders that don't change it, so this is hydration-safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isMobile && openMobile) {
    return <MobileNavContent />;
  }
  return <>{children}</>;
}
