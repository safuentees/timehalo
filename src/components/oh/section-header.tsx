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
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p
          id={legendId}
          className="oh-legend mb-1.5 text-base font-medium opacity-100"
          data-variant="legend"
        >
          {legend}
        </p>
        {title ? (
          <h2 className="text-[20px] font-black tracking-tight">{title}</h2>
        ) : null}
        {description ? (
          <p className="-mt-1.5 text-[13px] leading-[1.5] opacity-65">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
