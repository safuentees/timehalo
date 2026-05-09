"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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

const PAGE_FADE_DURATION = 0.22;
const PAGE_FADE_EASE = [0.16, 1, 0.3, 1] as const; // matches --ease-oh

export function OhDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density, motion: motionPref } = useOhPrefs();
  const pathname = usePathname();
  const isPreview = pathname?.startsWith("/preview/") ?? false;

  const insetClass = ["oh-root", motionPref ? "oh-motion" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <TooltipProvider delay={200}>
      <SidebarProvider
        className="oh-app-shell"
        data-typeface={typeface}
        data-density={density}
        data-oh-preview={isPreview ? "true" : undefined}
      >
        <OhDashboardBar />
        <div className="oh-app flex min-h-0 flex-1">
          <OhAppSidebar />
          <SidebarInset className={insetClass}>
            <div
              className="oh-host-content"
              data-oh-modal-host="true"
            >
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

function ContentSlot({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [navMounted, setNavMounted] = useState(false);

  useEffect(() => {
    if (isMobile && openMobile) {
      setNavMounted(true);
    }
  }, [isMobile, openMobile]);

  useEffect(() => {
    if (!isMobile && navMounted) {
      setNavMounted(false);
    }
  }, [isMobile, navMounted]);

  useEffect(() => {
    if (openMobile) {
      setOpenMobile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleExitComplete = useCallback(() => {
    setNavMounted(false);
  }, []);

  if (isMobile && navMounted) {
    return (
      <MobileNavContent
        closing={!openMobile}
        onExitComplete={handleExitComplete}
      />
    );
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={pathname ?? "root"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: PAGE_FADE_DURATION, ease: PAGE_FADE_EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
