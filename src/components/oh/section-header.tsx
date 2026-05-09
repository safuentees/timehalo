import type { ReactNode } from "react";

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
// Typography roles use .oh-legend / .oh-description from globals.css
// rather than inlining the mono+size+tracking+opacity strings — keeps
// the eight-class repetition out of every callsite.
//
// Legend overrides `.oh-legend`'s default 55% opacity to 100% to match
// the availability + profile single-form pattern
// (`availability-form.tsx` + `profile-form.tsx` render
// `<FieldLegend className="oh-legend opacity-100">`). Without the
// override, hub pages (workspaces, settings/general, members, danger
// zones) read at 55% — visibly dimmer than the single-form pages,
// which the user flagged as inconsistent. Bumping it here propagates
// to every SectionHeader callsite at once.

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
      <div className="min-w-0 flex-1">
        <p id={legendId} className="oh-legend opacity-100">
          {legend}
        </p>
        {title ? (
          <h2 className="mt-3 text-[20px] font-black tracking-tight">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="oh-description mt-3">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
