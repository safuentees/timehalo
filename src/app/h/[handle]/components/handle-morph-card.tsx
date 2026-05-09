"use client";

import { forwardRef, type ComponentProps } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { HANDLE_CARD_RADIUS_STYLE } from "./handle-morph-parts";

type HandleMorphCardProps = ComponentProps<typeof motion.article>;

export const HandleMorphCard = forwardRef<HTMLElement, HandleMorphCardProps>(
  function HandleMorphCard({ className, style, ...props }, ref) {
    return (
      <motion.article
        ref={ref}
        {...props}
        style={{
          ...HANDLE_CARD_RADIUS_STYLE,
          // Theme-aware via `--oh-handle-card-shadow` — light mode
          // resolves to `inset 0 0 15px rgba(0,0,0,0.25)` (the
          // original concave-paper feel against cream); dark mode
          // resolves to `--oh-shadow-popup` (drop + 1px tonal rim)
          // because the darkening inset on `#1a1a1a` paper fades into
          // the panel and stops carrying any depth cue. CSS-variable
          // resolution at paint time means the swap happens without
          // re-rendering the morph element, so the layoutId animation
          // doesn't restart on theme flip.
          boxShadow: "var(--oh-handle-card-shadow)",
          ...style,
        }}
        className={cn(
          "flex w-full flex-col bg-[color:var(--oh-paper)]",
          className,
        )}
      />
    );
  },
);
