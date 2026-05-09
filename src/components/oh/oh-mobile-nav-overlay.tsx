"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { MobileNavContent } from "./oh-app-sidebar";
import { cn } from "@/lib/utils";

// Mobile nav as a full-panel overlay over the page (scrim layer +
// nav surface, no content-replace, no vaul / drawer primitive).
// Page content always renders; this component mounts a scrim +
// a wrapper around <MobileNavContent /> that BOTH fill the entire
// dashboard panel when `openMobile` flips true. The wrapper's
// frosted-glass nav (recipe lives in oh-app-sidebar.tsx —
// bg-oh-paper/85 + backdrop-blur-xl + saturate-150) finally has
// page content behind it to blur through, instead of the uniform
// paper of the prior content-replace shape (B.PT49).
//
// Stack inside the panel:
//   z-40  scrim  — translucent ink wash over page; absorbs
//                  scroll/touch; tapping outside the nav surface
//                  closes the menu (the scrim IS that "outside"
//                  even though the nav is full-panel — clicks on
//                  the scrim still register at the panel edges
//                  where the nav's flex column doesn't fill).
//   z-50  nav    — full-panel wrapper around MobileNavContent.
//                  The nav's own translucent surface lets the
//                  scrim's wash + page show through the blur.
//
// MobileNavContent's GSAP stagger animation is UNCHANGED —
// same closing/onExitComplete contract, same per-item fade+rise
// timeline, same matchMedia reduced-motion handling. The only
// architectural shift is where the nav paints: previously
// ContentSlot returned <MobileNavContent /> IN PLACE of {children};
// now it renders as an absolute-positioned sibling above the
// still-rendered page.
//
// Lifecycle preserved: `navMounted` + `onExitComplete` still gate
// unmount on the GSAP reverse-stagger completion. `closing` is
// still `!openMobile`. The scrim fades in/out via a CSS opacity
// transition keyed on the `closing` boolean — independent of the
// GSAP timeline so the existing animation contract is untouched.
//
// Why all-Tailwind utilities (no custom CSS classes): adding new
// rules to globals.css doesn't always trigger Next.js dev's CSS
// rebuild reliably (PostCSS pipeline can miss the file change in
// some HMR paths — verified empirically: previous attempt's
// custom classes never landed in the built CSS chunk). Tailwind
// v4's JIT scans .tsx for utility classes used, so anything I
// write here is guaranteed to land in the next CSS chunk on save.
//
// Scoping: positioned absolute inside the [data-oh-modal-host]
// panel so the topbar (outside the panel) stays visible above.
// The sidebar is already null at <md.

const SCRIM_BASE = [
  // Fill the entire panel. z-40 sits below the nav surface (z-50)
  // but above the page content — so the page is dimmed while the
  // nav reads on top.
  "absolute inset-0 z-40",
  // Native button reset so the <button> element renders as a
  // clean wash without browser-default chrome.
  "border-0 p-0 m-0",
  "cursor-pointer",
  // Match the panel's outer corner radius so the scrim doesn't
  // bleed past the panel's rounded edge.
  "rounded-[inherit]",
  // Translucent ink wash. supports-[] gates the blur so browsers
  // without backdrop-filter see the bg-color directly. Color is
  // `--oh-ink` at 35% via color-mix — same wash as the bottom-
  // sheet drawer overlay's scrim.
  "bg-[color:color-mix(in_srgb,var(--oh-ink)_35%,transparent)]",
  "supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-[0.8]",
  // CSS opacity transition between open (1) and closing (0).
  // 200ms matches the GSAP stagger's perceived rhythm.
  "transition-opacity duration-200 ease-oh",
];

const WRAPPER_BASE = [
  // Fill the entire dashboard panel — full-viewport-of-panel
  // overlay. inset-0 = top/right/bottom/left all 0, so the
  // wrapper occupies every pixel of the panel's content area.
  // z-50 sits above the scrim (z-40).
  "absolute inset-0 z-50",
  // Flex column so MobileNavContent stacks its groups + the
  // wrapper itself stretches to full width/height of the panel.
  "flex flex-col",
  // Inherit the panel's rounded-window corner radius so the
  // wrapper's corners curve to match the panel's edges.
  "rounded-[inherit]",
  // Clip the inner <nav>'s frosted-glass surface to the rounded
  // wrapper.
  "overflow-hidden",
  // Make the inner <nav> stretch to fill the wrapper's full
  // height — by default `flex flex-col` + a flex-item with no
  // explicit grow gives content-height, so the nav would only
  // be tall enough for its groups. flex-1 (= flex: 1 1 0%) tells
  // it to absorb remaining vertical space, matching the original
  // content-replace footprint where the nav filled the entire
  // panel.
  "[&>nav]:flex-1",
];

export function OhMobileNavOverlay() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [navMounted, setNavMounted] = useState(false);

  // Mount as soon as user opens. We don't need a matching "unmount
  // on openMobile=false" effect — MobileNavContent tells us via
  // onExitComplete after its reverse-stagger finishes.
  useEffect(() => {
    if (isMobile && openMobile) setNavMounted(true);
  }, [isMobile, openMobile]);

  // If viewport flips to desktop while open (rotate, resize), drop
  // the nav state — desktop sidebar takes over.
  useEffect(() => {
    if (!isMobile && navMounted) setNavMounted(false);
  }, [isMobile, navMounted]);

  // Auto-close on route change. Lifted from the previous
  // ContentSlot pathname effect — the overlay's lifecycle owns its
  // own close semantics now. Watching pathname covers Link clicks
  // AND programmatic router.push from inside the nav. The exit
  // animation plays before unmount because navMounted stays true
  // until onExitComplete fires.
  useEffect(() => {
    if (openMobile) setOpenMobile(false);
    // pathname is the only signal we want here; including
    // openMobile/setOpenMobile would re-fire on close (no-op but
    // noisy).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleExitComplete = useCallback(() => {
    setNavMounted(false);
  }, []);

  if (!isMobile || !navMounted) return null;

  const closing = !openMobile;

  return (
    <>
      {/* Scrim — translucent ink wash above the page. Fades in
          on open, fades out on close via the `closing`
          conditional class. Tap anywhere on the scrim closes
          the menu (the nav above it covers most of the panel,
          but during the GSAP stagger the scrim is briefly
          visible at the edges and gives a clear backdrop wash).
          <button> for native keyboard / SR dismiss semantics. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpenMobile(false)}
        className={cn(SCRIM_BASE, closing ? "opacity-0" : "opacity-100")}
      />
      <div className={cn(WRAPPER_BASE)}>
        <MobileNavContent
          closing={closing}
          onExitComplete={handleExitComplete}
        />
      </div>
    </>
  );
}
