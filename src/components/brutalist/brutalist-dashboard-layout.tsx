"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrutalistAppSidebar } from "./brutalist-app-sidebar";
import { BrutalistTopbar } from "./topbar";
import { NewPostModal } from "./new-post-modal";
import { TweaksPanel } from "./tweaks-panel";
import { useBrutalistPrefs } from "./prefs-context";
import { useNewPost } from "./new-post-context";

export function BrutalistDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density, motion } = useBrutalistPrefs();
  const { open: modalOpen, closeNewPost } = useNewPost();

  useEffect(() => {
    // Flip directly on mount — wrapping in rAF is fragile on client
    // navigation (the callback can be skipped when React StrictMode
    // rapidly mounts → cleans up → mounts, or when the tab was hidden
    // between pages). The CSS keyframe itself handles the enter transition.
    document.body.classList.add("bru-ready");
  }, []);

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
          <BrutalistTopbar />
          {children}
        </SidebarInset>
        <NewPostModal open={modalOpen} onClose={closeNewPost} />
        <Suspense fallback={null}>
          <TweaksPanel />
        </Suspense>
      </SidebarProvider>
    </TooltipProvider>
  );
}
