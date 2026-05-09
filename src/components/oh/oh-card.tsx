import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

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
