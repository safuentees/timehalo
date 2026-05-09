import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Depth-card chrome — shared `<article>` wrapper for the project's
// borderless elevation pattern. Same `--oh-shadow-resting` →
// `--oh-shadow-hover` transition the workspaces / event-types /
// members rows already speak; centralized here so callsites don't
// re-roll the eight-class string and drift apart.
//
// The `active` prop bumps the resting shadow to the hover token AND
// drops the hover transition — useful for cards that represent the
// "current selection" state where the elevated chrome is the
// constant cue (e.g. the host's active plan tier on /billing).
//
// Inner padding stays at the callsite via `className` because the
// padding scale varies by row density: workflow rows use `p-4`,
// plan / billing cards use `p-5 sm:p-6`. Single chrome, multiple
// densities.

interface OhCardProps extends ComponentProps<"article"> {
  active?: boolean;
}

export function OhCard({ active, className, ...props }: OhCardProps) {
  return (
    <article
      data-slot="oh-card"
      data-active={active ? "true" : undefined}
      className={cn(
        "rounded-(--oh-r-sm) bg-oh-bg transition-[box-shadow,background-color] duration-150 ease-oh",
        active
          ? "shadow-[var(--oh-shadow-hover)]"
          : "shadow-[var(--oh-shadow-resting)] hover:shadow-[var(--oh-shadow-hover)]",
        className,
      )}
      {...props}
    />
  );
}
