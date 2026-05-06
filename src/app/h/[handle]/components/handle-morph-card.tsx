"use client";

import { type ComponentProps } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { HANDLE_CARD_RADIUS_STYLE } from "./handle-morph-parts";

type HandleMorphCardProps = ComponentProps<typeof motion.article>;

export function HandleMorphCard({
  className,
  style,
  ...props
}: HandleMorphCardProps) {
  return (
    <motion.article
      {...props}
      style={{
        ...HANDLE_CARD_RADIUS_STYLE,
        boxShadow: "inset 0 0 15px rgba(0,0,0,0.25)",
        ...style,
      }}
      className={cn(
        "flex w-full flex-col bg-[color:var(--oh-paper)]",
        className,
      )}
    />
  );
}
