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
        // Box-shadow is applied via the `oh-handle-morph-card` CSS class
        // (NOT inline style) so motion's `layoutId` projection system
        // can't touch it during the FLIP morph. Motion writes inline
        // `transform` + `transformOrigin` onto the active morph element
        // throughout the animation; in some configurations it also
        // re-evaluates / strips other inline styles mid-flight, which
        // visibly clears the box-shadow during the open/close morph
        // (the bug the user reported as "depth is lost when the
        // animation is playing"). A CSS-class-applied shadow is owned
        // by the cascade, not by the React-element style attribute, so
        // it survives the projection lifecycle. The shadow value itself
        // (`var(--oh-handle-card-shadow)`) is theme-aware via the token
        // so light → dark still swaps without a re-render.
        className={cn(
          "oh-handle-morph-card flex w-full flex-col bg-[color:var(--oh-paper)]",
          className,
        )}
      />
    );
  },
);
