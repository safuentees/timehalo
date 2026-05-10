"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OhAppSidebar } from "./oh-app-sidebar";
import { OhMobileNavOverlay } from "./oh-mobile-nav-overlay";
import { OhDashboardBar } from "./oh-dashboard-bar";
import { useOhPrefs } from "./prefs-context";
import {
  DashboardRouteTransitionProvider,
  useDashboardRouteTransition,
} from "./dashboard-route-transition";
import { PageTitleProvider } from "./page-title-context";

const PAGE_FADE_EXIT_TRANSITION = {
  duration: 0.14,
  ease: [0.4, 0, 1, 1],
} as const;
const PAGE_FADE_ENTER_TRANSITION = {
  duration: 0.2,
  ease: [0, 0, 0.2, 1],
} as const;

export function OhDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density } = useOhPrefs();
  const pathname = usePathname();
  const isPreview = pathname?.startsWith("/preview/") ?? false;

  return (
    <TooltipProvider delay={200}>
      <PageTitleProvider>
      <DashboardRouteTransitionProvider>
        <SidebarProvider
          className="oh-app-shell"
          data-typeface={typeface}
          data-density={density}
          data-oh-preview={isPreview ? "true" : undefined}
        >
          <OhDashboardBar />
          <div className="oh-app flex min-h-0 flex-1">
            <OhAppSidebar />
            <SidebarInset>
              <div
                className="oh-host-content"
                data-oh-modal-host="true"
              >
                <ScrollArea className="oh-host-content-inner">
                  <ContentSlot>{children}</ContentSlot>
                </ScrollArea>
                <OhMobileNavOverlay />
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </DashboardRouteTransitionProvider>
      </PageTitleProvider>
    </TooltipProvider>
  );
}

function ContentSlot({ children }: { children: ReactNode }) {
  const { phase, commitNavigation, finishEnter } =
    useDashboardRouteTransition();

  const routeOpacity =
    phase === "exiting" || phase === "navigating" ? 0 : 1;

  function handleRouteAnimationComplete() {
    if (phase === "exiting") {
      commitNavigation();
      return;
    }

    if (phase === "entering") {
      finishEnter();
    }
  }

  return (
    <motion.div
      className="oh-content-slot relative flex flex-col"
      initial={false}
      animate={{
        opacity: routeOpacity,
        transition:
          phase === "exiting"
            ? PAGE_FADE_EXIT_TRANSITION
            : PAGE_FADE_ENTER_TRANSITION,
      }}
      onAnimationComplete={handleRouteAnimationComplete}
    >
      {children}
    </motion.div>
  );
}
