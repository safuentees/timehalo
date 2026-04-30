import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type OhEmptyProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  title: ReactNode;
  description?: ReactNode;
  /**
   * Primary action for the empty state. Renders below the description
   * with `mt-2` spacing. Pattern: cal.com `EmptyScreen.buttonText` +
   * `buttonOnClick` slot — but as a flexible `ReactNode` so callers
   * compose any button shape (Link, Button, dialog trigger). Audit
   * `§4.2` finding: empties without an action read as dead-ends.
   */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function OhEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: OhEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-(--oh-r-sm) border-2 border-dashed border-oh-line-strong p-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className="size-8 text-[color:var(--oh-content-subtle)]"
        />
      ) : null}
      <h3 className="font-heading text-base font-bold tracking-tight">
        {title}
      </h3>
      {description ? (
        <p className="max-w-xs text-[13px] leading-relaxed text-[color:var(--oh-content-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {children}
    </div>
  );
}
