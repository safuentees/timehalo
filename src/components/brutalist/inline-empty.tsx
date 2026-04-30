import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrutalistInlineEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-(--oh-r-xs) border-[1.5px] border-dashed border-oh-line p-4 text-[13px] opacity-55",
        className,
      )}
    >
      {children}
    </p>
  );
}
