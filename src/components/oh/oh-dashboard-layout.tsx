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

// Per-route content fade. `<AnimatePresence initial={false}>` skips
// the entrance animation on first mount (so the SSR-rendered HTML
// doesn't flash from "fully visible" to opacity 0 to opacity 1 on
// hydration) and runs enter+exit on subsequent navigations when the
// motion.div's `key={pathname}` changes. Default sync mode means new
// mounts simultaneously while old fades out — no `mode="wait"`
// state-machine that triggered the "Rendered more hooks than during
// the previous render" error on /settings → /settings/general (the
// redirect-driven double commit confused mode="wait"'s stale-snapshot
// path).
//
// Cal.com uses AnimatePresence locally inside surfaces like Booker
// for view-swaps (form → confirmation), not at the route level —
// our visitor `/h/[handle]` modal follows the same shape. The
// dashboard route fade IS at the route level, but `initial={false}`
// + default sync mode keeps it light enough to behave like a local
// transition.
const PAGE_FADE_DURATION = 0.22;
const PAGE_FADE_EASE = [0.16, 1, 0.3, 1] as const; // matches --ease-oh


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
// Preview-mode chrome morph. When the pathname matches `/preview/<handle>`,
// the shell carries `data-oh-preview="true"`. CSS rules on
// `[data-oh-preview="true"]` (in globals.css) drive the morph: topbar
// slides up + height collapses, sidebar fades + sidebar-gap width
// animates to 0, panel margin-left equalizes from 0 → 12px. Plain CSS
// transitions on transform/opacity (compositor-friendly) plus a single
// margin transition on the panel — no View Transitions API, no
// per-frame snapshot machinery, just the attribute change firing the
// transitions naturally.
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
            {/* The panel owns the static visual frame (paper bg, rounded
                corners, margin from the cream frame); the inner ScrollArea
                wraps the page content. The motion AnimatePresence inside
                ContentSlot animates ONLY the page content on route change
                — chrome (sidebar, top-bar) sits outside the AnimatePresence
                and never participates in the fade. */}
            <div
              className="oh-host-content"
              // B.PT301 — modal host marker. ResponsiveModal queries
              // for `[data-oh-modal-host="true"]` at open time and
              // portals into THIS element instead of `document.body`,
              // so drawers + dialogs visually slide up from / center
              // within the rounded paper panel (not the full viewport).
              // Falls back to body when no host element is found
              // (visitor surface, auth shells, etc).
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

  // Per-route content fade — see top-of-file comment for the why
  // behind `initial={false}` + default sync mode.
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
