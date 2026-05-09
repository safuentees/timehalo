import type { ReactNode } from "react";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

// Single source of truth for settings section chrome. Every /settings
// section renders the same structure: legend (mono uppercase), an
// optional title (only the danger zone uses it for now), an optional
// description as a single 5-10 word sentence, and an optional primary
// action inline-end.
//
// Description is full-width below the legend row instead of right of
// the legend so a long description doesn't push the action button out
// of alignment with neighbouring sections. legendId is exposed so
// section content can wire `aria-labelledby` for radiogroups, lists,
// and other composite controls.
//
// Typography and spacing intentionally reuse the same FieldLegend /
// FieldDescription primitives and class strings as profile +
// availability single-form sections, so hub-page section subtitles are
// pixel-identical instead of manually restated.

export function SectionHeader({
  legendId,
  legend,
  title,
  description,
  action,
}: {
  legendId?: string;
  legend: string;
  /** Optional emphasized subhead. Only Danger Zone uses this today. */
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
