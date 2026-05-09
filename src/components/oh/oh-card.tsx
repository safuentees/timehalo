import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

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
