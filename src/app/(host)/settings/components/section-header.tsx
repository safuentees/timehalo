import type { ReactNode } from "react";

// Single source of truth for settings section chrome. Every /settings
// section renders the same structure: legend (mono uppercase), an
// optional primary action inline-end (cal.com pattern — puts the "what
// can I do here" affordance in the same screen position for every
// section), and the description below as a single 5-10 word sentence.
//
// Description is full-width below the legend row instead of right of
// the legend so a long description doesn't push the action button out
// of alignment with neighbouring sections. legendId is exposed so
// section content can wire `aria-labelledby` for radiogroups, lists,
// and other composite controls.

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
