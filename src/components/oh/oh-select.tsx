import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type OhSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

export function OhSelect({
  className,
  wrapperClassName,
  children,
  ...rest
}: OhSelectProps) {
  return (
    <span className={cn("relative inline-block w-full", wrapperClassName)}>
      <select
        {...rest}
        className={cn(
          "oh-input appearance-none pr-9",
          className,
        )}
        suppressHydrationWarning
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-[color:var(--oh-ink)] opacity-[0.55]"
      />
    </span>
  );
}
