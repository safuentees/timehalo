import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

// Depth-card chrome — shared `<article>` wrapper for the project's
// borderless elevation pattern. Same `--oh-shadow-resting` →
// `--oh-shadow-hover` transition the workspaces / event-types /
// members rows already speak; centralized here so callsites don't
// re-roll the eight-class string and drift apart.
//
// State props (mutually exclusive):
//   • `active` — renders the elevated (`--oh-shadow-hover`) shadow
//     at rest AND drops the hover lift. Use for "this card is the
//     current selection" (e.g. the host's active plan tier).
//   • `muted`  — renders at 60% opacity AND drops the hover lift.
//     Use for accepted / expired / dismissed rows that should
//     visually recede.
//
// Polymorphism:
//   • `asChild` — renders via Radix Slot, merging the depth chrome
//     onto the child element. Use when the card needs to BE a
//     `<Link>` (whole-row navigation), a `<button>`, etc. Without
//     asChild, OhCard renders an `<article>`.
//
// Inner padding / layout stays at the callsite via `className`
// because density varies — workflow rows `p-4`, plan / billing
// cards `p-5 sm:p-6`. Single chrome, multiple densities.

interface OhCardProps extends ComponentProps<"article"> {
  active?: boolean;
  muted?: boolean;
  asChild?: boolean;
}

export function OhCard({
  active,
  muted,
  asChild,
  className,
  ...props
}: OhCardProps) {
  const Comp = asChild ? Slot : "article";
  return (
    <Comp
      data-slot="oh-card"
      data-active={active ? "true" : undefined}
      data-muted={muted ? "true" : undefined}
      className={cn(
        "rounded-(--oh-r-sm) bg-oh-bg transition-[box-shadow,background-color,opacity] duration-150 ease-oh",
        active
          ? "shadow-[var(--oh-shadow-hover)]"
          : muted
            ? "opacity-60 shadow-[var(--oh-shadow-resting)]"
            : "shadow-[var(--oh-shadow-resting)] hover:shadow-[var(--oh-shadow-hover)]",
        className,
      )}
      {...props}
    />
  );
}
