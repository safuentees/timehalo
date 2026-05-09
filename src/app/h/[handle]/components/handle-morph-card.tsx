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
          ...style,
        }}
        className={cn(
          "oh-handle-morph-card flex w-full flex-col bg-[color:var(--oh-paper)]",
          className,
        )}
      />
    );
  },
);
