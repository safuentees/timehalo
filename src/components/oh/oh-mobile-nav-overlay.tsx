"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useSidebar } from "@/components/ui/sidebar";
import { MobileNavContent } from "./oh-app-sidebar";
import { cn } from "@/lib/utils";

const SCRIM_BASE = [
  "absolute inset-0 z-40",
  "border-0 p-0 m-0",
  "cursor-pointer",
  "rounded-[inherit]",
  "bg-transparent",
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
      <motion.button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpenMobile(false)}
        className={cn(SCRIM_BASE)}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className={cn(WRAPPER_BASE, "bg-oh-paper")}
        initial={{ clipPath: "inset(0 0 100% 0)" }}
        animate={{
          clipPath: closing ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
        }}
        transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        onAnimationComplete={() => {
          if (closing) handleExitComplete();
        }}
      >
        <MobileNavContent
          closing={closing}
          onExitComplete={handleExitComplete}
        />
      </motion.div>
    </>
  );
}
