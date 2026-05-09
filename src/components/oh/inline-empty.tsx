import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OhInlineEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "oh-empty-surface rounded-(--oh-r-sm) px-4 py-3.5 text-[13px] opacity-65",
        className,
      )}
    >
      {children}
    </p>
  );
}
