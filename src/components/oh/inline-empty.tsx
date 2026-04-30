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
        "rounded-(--oh-r-xs) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] p-4 text-[13px] opacity-55",
        className,
      )}
    >
      {children}
    </p>
  );
}
