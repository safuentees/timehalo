"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
//
// Preview-mode chrome morph (B.PT60). When the pathname matches
// `/preview/<handle>`, the shell carries `data-oh-preview="true"`. CSS
// rules on `[data-oh-preview="true"]` (in globals.css) drive the morph:
// topbar slides up + height collapses, sidebar fades + sidebar-gap
// width animates to 0, panel margin-left equalizes from 0 → 12px. The
// state is read from pathname instead of from a context flag so the
// CSS toggles in step with route navigation — no useEffect race, no
// extra context plumbing. View Transitions API still wraps the route
// change for the inner content snapshot; the chrome morph runs
// alongside it as a longer 380ms transition.
export function OhDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { typeface, density, motion } = useOhPrefs();
  const pathname = usePathname();
  const isPreview = pathname?.startsWith("/preview/") ?? false;

  // B.PT69 — Firefox fallback. Firefox's same-document View Transitions
  // API support (133+) still hits known limitations on `position: fixed`
  // elements (Bugzilla #1688813 / storybookjs/storybook#33631) — our
  // sidebar primitive's `[data-slot="sidebar-container"]` is fixed-
  // positioned, so Firefox's VT snapshot of it can render at the wrong
  // coordinates or fail entirely. Chrome/Safari handle it correctly.
  // Tag the documentElement so the CSS in globals.css can opt Firefox
  // out of the VT-driven morph and apply a CSS-transition fallback on
  // the panel margin. UA detection is the most reliable signal (CSS
  // `@supports` doesn't distinguish Firefox 133+ from Chrome reliably
  // because both implement the same baseline feature set).
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (/firefox/i.test(navigator.userAgent)) {
      document.documentElement.classList.add("oh-firefox");
    }
  }, []);

  const insetClass = ["oh-root", motion ? "oh-motion" : ""]
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
//
// Mount state is intentionally decoupled from `openMobile` so the
// mobile nav's exit animation has runway: when the user closes (taps
// hamburger again or navigates), `openMobile` flips false immediately
// but `navMounted` stays true until <MobileNavContent /> calls
// `onExitComplete` from its reverse-stagger animation. Without this
// decoupling the nav would unmount the moment `openMobile` flipped,
// killing the exit animation mid-flight.
function ContentSlot({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [navMounted, setNavMounted] = useState(false);

  // Mount the nav as soon as the user opens it. We don't need a
  // matching "unmount on openMobile=false" effect — the nav itself
  // tells us via onExitComplete.
  useEffect(() => {
    if (isMobile && openMobile) {
      setNavMounted(true);
    }
  }, [isMobile, openMobile]);

  // If the viewport flips to desktop while the nav is open (rotate,
  // resize), drop the nav state immediately — the desktop sidebar
  // takes over and the content slot must render the page.
  useEffect(() => {
    if (!isMobile && navMounted) {
      setNavMounted(false);
    }
  }, [isMobile, navMounted]);

  // Auto-close the mobile menu on route change. Without this the user
  // would tap a nav link, navigate, and the new page would still be
  // hidden behind the menu (openMobile is in React state across
  // navigation). Watching pathname covers both Link clicks and
  // programmatic router.push from inside the nav. The exit animation
  // plays before the unmount because navMounted stays true until
  // MobileNavContent fires onExitComplete.
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
  return <>{children}</>;
}
