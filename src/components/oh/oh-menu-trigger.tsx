"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

gsap.registerPlugin(MorphSVGPlugin);

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

        if (openMobile) {
          tl.progress(1).pause();
        }
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        tlRef.current = null;
      });

      return () => mm.revert();
    },
    { scope: containerRef },
  );

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
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
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-(--oh-r-xs)",
        "text-[color:var(--oh-ink)] [&_svg]:opacity-[0.55] [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-oh",
        "hover:[&_svg]:opacity-100 active:[&_svg]:opacity-100 aria-expanded:[&_svg]:opacity-100",
        "[-webkit-tap-highlight-color:transparent]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2",
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
