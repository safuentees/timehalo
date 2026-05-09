"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Plugin registration must happen at module scope so the bundler
// preserves the import (otherwise tree-shaking can drop it). All
// GSAP plugins shipped in the public `gsap` npm package since the
// Webflow acquisition (fall 2024) — MorphSVG is now free for
// commercial use. Verified at node_modules/gsap/MorphSVGPlugin.js.
gsap.registerPlugin(MorphSVGPlugin);

// Mobile menu trigger that morphs between hamburger and X via SVG
// path interpolation. Replaces the static `PanelLeftIcon` that
// shadcn's `<SidebarTrigger>` ships with — the trigger lives in the
// dashboard bar (md:hidden) and toggles the mobile content-slot nav
// established in B.PT49 + B.PT52.
//
// Two-path structure for clean morphing:
// • #morph-lines: just the TOP + BOTTOM strokes (4 anchors total).
//   MorphSVG interpolates anchor-by-anchor between the hamburger
//   layout and the X layout. Same anchor count = no automatic
//   point-distribution weirdness in intermediate frames.
// • #middle-line: the middle hamburger stroke as a separate path.
//   Tweened opacity + scaleX in parallel with the morph; collapses
//   inward as the X forms so it doesn't linger underneath.
//
// Trying to morph the entire 6-anchor hamburger to the 4-anchor X
// in a single path would force MorphSVG to insert/redistribute
// anchors — produces a brief "wiggle" mid-morph. Splitting into
// two paths keeps each interpolation linear.
//
// Inline SVG path data here is the chisel-allowed exception (rule:
// "Never write inline SVG path data" applies to static artwork; for
// animated morphs the path string IS the animation parameter and
// per-element refs require inline geometry).
//
// Raw <button> follows the project's tertiary-chrome convention
// documented in .claude/rules/oh-ui.md *Button variants*: same
// pattern as `FooterControls` in oh-app-sidebar.tsx — minimal
// styling, no shadcn variant baggage, lint rule (B.PT46) doesn't
// apply because there's no <Button variant="..."> at all.

const HAMBURGER_LINES = "M4 7 L20 7 M4 17 L20 17"; // top + bottom
const X_LINES = "M5 5 L19 19 M19 5 L5 19"; // top-left↘ + top-right↙

export function OhMenuTrigger({ className }: { className?: string }) {
  const { openMobile, toggleSidebar } = useSidebar();
  const t = useTranslations("Chrome");
  const containerRef = useRef<HTMLButtonElement>(null);
  const morphRef = useRef<SVGPathElement>(null);
  const middleRef = useRef<SVGPathElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (!morphRef.current || !middleRef.current) return;

        const tl = gsap.timeline({ paused: true });
        tl.to(
          morphRef.current,
          {
            morphSVG: X_LINES,
            duration: 0.4,
            ease: "power3.inOut",
          },
          0,
        );
        tl.to(
          middleRef.current,
          {
            opacity: 0,
            scaleX: 0,
            duration: 0.22,
            ease: "power2.out",
            transformOrigin: "center center",
          },
          0,
        );

        tlRef.current = tl;

        // Sync to current state on mount. If the user hard-refreshed
        // while the menu was open, we land at progress 1 (X) without
        // animating in.
        if (openMobile) {
          tl.progress(1).pause();
        }
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        // No timeline. The d attribute itself toggles in the effect
        // below (via gsap.set() so it survives re-renders).
        tlRef.current = null;
      });

      return () => mm.revert();
    },
    { scope: containerRef },
  );

  // Drive direction from openMobile. Same single-timeline pattern
  // from B.PT52 (mobile nav stagger) — forward play on open, reverse
  // at timeScale 1.4 on close (snappier close mirrors the rest of
  // the chrome's exit cadence).
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
      // Reduced-motion path: snap the d attribute without animation.
      if (morphRef.current && middleRef.current) {
        gsap.set(morphRef.current, {
          attr: { d: openMobile ? X_LINES : HAMBURGER_LINES },
        });
        gsap.set(middleRef.current, {
          opacity: openMobile ? 0 : 1,
          scaleX: openMobile ? 0 : 1,
        });
      }
      return;
    }

    if (openMobile) {
      tl.timeScale(1).play();
    } else {
      tl.timeScale(1.4).reverse();
    }
  }, [openMobile]);

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={toggleSidebar}
      aria-label={openMobile ? t("closeMenu") : t("openMenu")}
      aria-expanded={openMobile}
      // Mobile dashboard-bar grid slot — pinned to column 1 by the
      // `[data-bar-slot="start"]` rule in globals.css. Explicit slot
      // marker (instead of positional :first-child) so the
      // OhTopProgressBar mounting as a sibling during a workspace
      // switch can't shift the icons-group out of column 3.
      data-bar-slot="start"
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-(--oh-r-xs)",
        // Solid ink color + opacity-on-SVG so the hamburger ↔ X
        // morph's stroke intersections don't compose double-alpha.
        // opacity-[0.55] matches the prior perceived dimness; hover/
        // active/openMobile lift to opacity-100.
        "text-[color:var(--oh-ink)] [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-oh",
        "hover:[&_svg]:opacity-100 active:[&_svg]:opacity-100 aria-expanded:[&_svg]:opacity-100",
        // Chrome-toggle treatment, NOT button-action. The morph
        // (hamburger ↔ X) is the focal animation; a hover bg-tint
        // would compete with it. Mirrors `FooterControls` in
        // oh-app-sidebar.tsx (the sidebar collapse trigger), which
        // is the same kind of element — chrome state toggle, not
        // navigation. The right-side icon-links in this same bar
        // (`ChromeIconLink`) keep the bg-tint hover because they
        // ARE navigation. See chisel review B.PT53.
        // Suppress iOS Safari's default grey tap highlight so the
        // morph animation has the activation feedback to itself.
        "[-webkit-tap-highlight-color:transparent]",
        "oh-focus-ring",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path ref={morphRef} d={HAMBURGER_LINES} />
        <path ref={middleRef} d="M4 12 L20 12" />
      </svg>
    </button>
  );
}
