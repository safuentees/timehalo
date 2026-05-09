"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
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
  // Translucent ink wash. backdrop-filter / blur removed per
  // request — scrim is a flat dim layer, not a frosted one.
  // Mostly hidden by the full-fill solid nav above it; remains
  // as the click-to-dismiss target. Opacity tween owned by
  // motion (animate prop on the JSX <motion.button>).
  "bg-[color:color-mix(in_srgb,var(--oh-ink)_35%,transparent)]",
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
  // NO frosted-glass on the wrapper itself — moved entirely to
  // the inner <nav> in oh-app-sidebar.tsx.
  //
  // Why: per MDN's `backdrop-filter` spec, an element with
  // `backdrop-filter ≠ none` becomes a "backdrop root" — its
  // descendants' own `backdrop-filter` queries are scoped to
  // BLUR ONLY content between the root and the descendant, not
  // anything outside the root. So when the wrapper had
  // `backdrop-blur-[48px]`, the inner <nav>'s identical
  // `backdrop-blur-[48px]` only saw the wrapper's bg as its
  // backdrop — NOT the page underneath. Net effect: two stacked
  // 78% paper layers (~95% opaque), zero visible blur of the
  // page, and in dark mode (where `--oh-paper` is `#0a0a0a`)
  // the user perceived a "fully black" surface.
  //
  // Fix per spec: keep `backdrop-filter` on ONE layer only. The
  // inner <nav> is the right home — its frosted-glass classes
  // pre-date this overlay refactor (B.PT49 era). With the
  // wrapper transparent and not a backdrop root, the nav's
  // `backdrop-filter` walks up to the next backdrop root
  // (effectively `<html>`) and blurs everything in between:
  // scrim wash + page content. That's the iOS-style frosted
  // glass the user wants.
  //
  // The `[&>nav]:flex-1` below stretches MobileNavContent's
  // <nav> to full panel height; the nav's own bg + blur paint
  // the visible drawer surface.
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
      {/* Scrim — translucent ink wash. Fades in on open, fades
          out on close. <button> for native keyboard / SR
          dismiss semantics. */}
      <motion.button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpenMobile(false)}
        className={cn(SCRIM_BASE)}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Wrapper — animates `clip-path` to reveal/hide the
          panel top-down. Bg and content are STATIC children:
          the wrapper's clip rect grows from height 0 (top edge)
          to full height on open, shrinks back on close. Items
          inside stay locked at their final positions — they
          only become visible as the clip rect reaches them.
          Solves the "items visible outside the bg" issue: clip
          rect masks bg + items together.
          Per CSS-Tricks "Animating with clip-path": inset
          animations affect only what's rendered, never layout —
          item positions don't shift mid-animation. */}
      <motion.div
        className={cn(WRAPPER_BASE, "bg-oh-paper")}
        initial={{ clipPath: "inset(0 0 100% 0)" }}
        animate={{
          clipPath: closing ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
        }}
        // Symmetric 0.55s both directions per request — same
        // leisurely pace open and close. Ease matches `--ease-oh`.
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <MobileNavContent
          closing={closing}
          onExitComplete={handleExitComplete}
        />
      </motion.div>
    </>
  );
}
