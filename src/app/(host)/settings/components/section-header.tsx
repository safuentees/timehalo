import type { ReactNode } from "react";

export function SectionHeader({
  legendId,
  legend,
  description,
  action,
}: {
  legendId?: string;
  legend: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <p
          id={legendId}
          className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
        >
          {legend}
        </p>
        {description ? (
          <p className="mt-3 max-w-prose text-[13px] leading-[1.5] opacity-65">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
