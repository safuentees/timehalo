"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

// shadcn ScrollArea, brutalized.
//
// Radix renders an absolutely-positioned scrollbar that floats over the
// viewport — true overlay behavior, no layout shift. The thumb only
// appears while the user is actively scrolling (matches the ChatGPT
// API-logs feel the user pointed at). Native scrolling is preserved
// via CSS transforms inside the Viewport, so wheel/keyboard/touch
// behave normally — no JS scroll hijack.
//
// Brutalist tweaks vs the shadcn default:
//   - Thinner thumb: w-1.5 (6px) instead of w-2.5
//   - Ink-tinted thumb at 25% opacity (sits as a quiet line)
//   - Hover bumps to 50% opacity for affordance
//   - rounded-none (the rest of the brutalist surface uses sharp/2px
//     radii; a softly rounded thumb would feel mismatched at this size)
//   - No track: bg-transparent so the bar floats with no visible gutter

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] focus-visible:outline-none"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px transition-opacity",
        orientation === "vertical" && "h-full w-1.5",
        orientation === "horizontal" && "h-1.5 flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-none bg-[color-mix(in_srgb,var(--bru-ink)_25%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--bru-ink)_50%,transparent)]"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
