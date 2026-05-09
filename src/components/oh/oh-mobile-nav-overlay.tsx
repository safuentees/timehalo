"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { MobileNavContent } from "./oh-app-sidebar";
import { cn } from "@/lib/utils";

const SCRIM_BASE = [
  "absolute inset-0 z-40",
  "border-0 p-0 m-0",
  "cursor-pointer",
  "rounded-[inherit]",
  "bg-[color:color-mix(in_srgb,var(--oh-ink)_35%,transparent)]",
  "supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-[0.8]",
  "transition-opacity duration-200 ease-oh",
];

const WRAPPER_BASE = [
  "absolute inset-0 z-50",
  "flex flex-col",
  "rounded-[inherit]",
  "overflow-hidden",
  "[&>nav]:flex-1",
];

export function OhMobileNavOverlay() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [navMounted, setNavMounted] = useState(false);

  useEffect(() => {
    if (isMobile && openMobile) setNavMounted(true);
  }, [isMobile, openMobile]);

  useEffect(() => {
    if (!isMobile && navMounted) setNavMounted(false);
  }, [isMobile, navMounted]);

  useEffect(() => {
    if (openMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleExitComplete = useCallback(() => {
    setNavMounted(false);
  }, []);

  if (!isMobile || !navMounted) return null;

  const closing = !openMobile;

  return (
    <>
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
