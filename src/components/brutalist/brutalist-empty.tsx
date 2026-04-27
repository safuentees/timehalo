import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type BrutalistEmptyProps = {
  icon?: ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function BrutalistEmpty({
  icon: Icon,
  title,
  description,
  className,
  children,
}: BrutalistEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-(--bru-r-sm) border-2 border-dashed border-bru-line-strong p-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className="size-8 text-[color:var(--bru-content-subtle)]"
        />
      ) : null}
      <h3 className="font-heading text-base font-bold tracking-tight">
        {title}
      </h3>
      {description ? (
        <p className="max-w-xs text-[13px] leading-relaxed text-[color:var(--bru-content-muted)]">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
