"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OhAppSidebar } from "./oh-app-sidebar";
import { OhMobileNavOverlay } from "./oh-mobile-nav-overlay";
import { OhDashboardBar } from "./oh-dashboard-bar";
import { useOhPrefs } from "./prefs-context";
import {
  DashboardRouteTransitionProvider,
  useDashboardRouteTransition,
} from "./dashboard-route-transition";
import { PageTitleProvider } from "./page-title-context";

// Per-route content fade. The dashboard deliberately does NOT key the
// page wrapper by `pathname`: in the App Router, the server `children`
// prop can already contain the destination page by the time a keyed
// client wrapper captures its exiting child, so the destination clone
// fades out and then fades back in.
//
// Instead, dashboard links ask the persistent content wrapper to fade
// the current route out first. Only after that animation completes do
// we call `router.push`; while the route payload swaps, the wrapper is
// already at opacity 0, and it fades the new page in when `usePathname`
// reports the destination. This matches the intended flow:
// click route -> old content fades out -> new content fades in.
const PAGE_FADE_EXIT_TRANSITION = {
  duration: 0.14,
  ease: [0.4, 0, 1, 1],
} as const;
const PAGE_FADE_ENTER_TRANSITION = {
  duration: 0.2,
  ease: [0, 0, 0.2, 1],
} as const;

// SidebarProvider is the OUTER wrapper — it owns the sidebar context
// (open/openMobile/toggleSidebar) and used to own a sheet-portal for
// the mobile drawer. Lifting it above the dashboard bar lets the bar
// render a `<SidebarTrigger>` at <md so the mobile menu has an opener.
// Cal.com `Shell.tsx` follows the same pattern: provider at the top,
// top bar inside, sidebar+inset row underneath.
//
// Mobile mode (2026-05-09 follow-up): page renders always; the
// mobile nav mounts as a fixed-position overlay above it via
// <OhMobileNavOverlay />, rendered as a sibling of the ScrollArea
// inside the panel. Previously (B.PT49) the nav replaced page
// content via ContentSlot branching — that left the frosted-glass
// blur with nothing to blur through. Overlay shape preserves the
// EXACT same GSAP staggered enter/exit (MobileNavContent itself
// is unchanged); the only delta is where it paints. See
// `oh-mobile-nav-overlay.tsx` for the full rationale.
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
  const { typeface, density } = useOhPrefs();
  const pathname = usePathname();
  const isPreview = pathname?.startsWith("/preview/") ?? false;

  // Note: `oh-root` + `oh-motion` were previously added to the
  // SidebarInset here. Removed because every effect they had on the
  // dashboard was either redundant or harmful:
  //
  //   - `position: relative` — already on SidebarInset via Tailwind
  //     class `relative` (shadcn primitive).
  //   - `width: 100%` — already via `w-full`.
  //   - `background: var(--oh-frame)` — already via `bg-background`,
  //     which `.oh-app` re-aliases to `var(--oh-frame)` for the
  //     dashboard scope (globals.css line 1225). No seam, no
  //     mismatch.
  //   - `color: var(--oh-ink)` + body font — inherited from
  //     `.oh-app-shell` (the SidebarProvider wrapper) which sets
  //     them at the layout root.
  //   - `container-type: inline-size; container-name: oh-root` —
  //     unused on the dashboard. Every `@container oh-root` rule in
  //     globals.css targets visitor-surface classes only
  //     (`.oh-hero`, `.oh-topbar`, `.oh-post`, `.oh-profile-cta`,
  //     `.oh-v1-hero`, etc.). None apply inside the dashboard tree.
  //   - `min-height: 100vh` — **the harmful part**. The
  //     `.oh-app-shell` is already viewport-anchored at `100svh`
  //     and the SidebarInset is a `flex-1 min-h-0` child of
  //     `.oh-app` (which is `flex-1` of the column-flex shell).
  //     The shell carefully partitions: dashboard bar pays its
  //     `--oh-dashboard-bar-block` slot at the top, the row pays
  //     the rest via flex-1. Forcing `min-height: 100vh` on the
  //     inset breaks that partition — on viewports where vh > svh
  //     (mobile Safari with the URL bar visible) the inset
  //     overflows below its allotted space, body scrolls, and the
  //     dashboard bar gets pushed off the top. User reported this
  //     as "topbar disappears with invisible space at the bottom."
  //
  // `oh-motion` similarly only affected `.oh-ticker-track` on
  // visitor pages (globals.css line 1426). Dashboard has no
  // ticker; the class was dead weight.
  //
  // Visitor surfaces (`/h/[handle]`, `/w/[slug]`, `/(dev)`) keep
  // their own `oh-root` wrapper — those are standalone page-level
  // containers where 100vh + container queries apply by design.

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
              {/* The panel owns the static visual frame (paper bg, rounded
                  corners, margin from the cream frame); the inner ScrollArea
                  wraps the page content. ContentSlot animates ONLY the page
                  content on route change — chrome (sidebar, top-bar) sits
                  outside the route fade and never participates. */}
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
                {/* Native overflow-y-auto, not Radix ScrollArea.
                    Radix Viewport wraps children in a `display:
                    table` div (see node_modules/@radix-ui/
                    react-scroll-area/dist/index.mjs:130) which
                    breaks the flex/percentage-height chain — fit-
                    viewport pages can't reach a definite-height
                    ancestor through `display: table`. shadcn's
                    ScrollArea is purely decorative (custom thumb
                    visuals); native scroll preserves all functional
                    behavior + lets `flex-1 min-h-0` chains resolve.
                    Sidebar trigger / mobile nav unaffected. */}
                <div className="oh-host-content-inner overflow-y-auto">
                  <ContentSlot>{children}</ContentSlot>
                </div>
                {/* Mobile nav overlay — absolute-positioned sibling
                    of the ScrollArea so it paints above the page
                    inside the panel boundary. Renders nothing on
                    desktop or when openMobile is false. */}
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

// Per-route content fade. Pre-2026-05-09 also owned the mobile-nav
// content-replace branching + navMounted state machine; that
// responsibility moved to <OhMobileNavOverlay /> which renders as a
// sibling of this slot and owns its own mount/close lifecycle. What
// remains here is the route-fade machinery: when a dashboard link
// asks for a transition, this wrapper fades the current route out,
// calls commitNavigation, then fades the new route in.
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

  // Per-route content fade — see top-of-file comment for the sequencing.
  return (
    <motion.div
      // `min-h-full` so block-shaped pages (single flex item with
      // natural height) at least fill the panel; long content
      // grows past and the parent overflow-y-auto scrolls. `h-full`
      // for fit-viewport pages would clip — `min-h-full` is the
      // right default. Calendar mode opts in via `absolute inset-0`
      // on its wrapper (anchors to motion.div's `relative`).
      //
      // `relative` is the containing-block anchor for absolute
      // children. After replacing Radix ScrollArea with a native
      // `overflow-y-auto` div, the flex/percentage-height chain
      // resolves cleanly — motion.div parent is now a plain block
      // div, not Radix's `display: table` wrapper.
      className="relative flex min-h-full flex-col"
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
