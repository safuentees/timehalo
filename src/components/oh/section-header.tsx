import type { ReactNode } from "react";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

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
      <FieldSet className="min-w-0 flex-1">
        <FieldLegend
          id={legendId}
          className="oh-legend opacity-100"
        >
          {legend}
        </FieldLegend>
        {title ? (
          <h2 className="text-[20px] font-black tracking-tight">{title}</h2>
        ) : null}
        {description ? (
          <FieldDescription
            className={
              title
                ? "-mt-1.5 text-[13px] leading-[1.5] opacity-65"
                : "text-[13px] leading-[1.5] opacity-65"
            }
          >
            {description}
          </FieldDescription>
        ) : null}
      </FieldSet>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
