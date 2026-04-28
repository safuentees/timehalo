import type { ReactNode } from "react";

export function SectionHeader({
  legendId,
  legend,
  title,
  description,
  action,
}: {
  legendId?: string;
  legend: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <p id={legendId} className="bru-legend">
          {legend}
        </p>
        {title ? (
          <h2 className="mt-3 text-[20px] font-black tracking-tight">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="bru-description mt-3">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
