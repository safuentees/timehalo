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
// Typography matches the availability + profile single-form pattern
// (`<FieldLegend className="oh-legend opacity-100">` +
// `<FieldDescription className="text-[13px] leading-[1.5] opacity-65">`)
// so hub-page sections (workspaces, settings/general, members,
// danger zones) read identical to single-form pages.
//
// Two reasons we don't reach for `.oh-description` here even though
// it ships in globals.css:
//   1. `.oh-description` carries `max-width: 65ch` — availability +
//      profile inline `text-[13px] leading-[1.5] opacity-65` instead,
//      so their descriptions span the full content column.
//   2. Spacing: availability's FieldSet `gap-4` + FieldLegend `mb-1.5`
//      + FieldDescription `-mt-1.5` collapse to ~16px visible gap
//      between legend and description. We match with `mt-4` on the
//      description in this plain-div layout.
//
// Net: identical look across every legend/description block in the
// host shell.

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
        {/* Two Tailwind utilities are needed here to match what
            `<FieldLegend>` ships on availability + profile. Both
            survive a cascade-layers gotcha — `.oh-legend` lives in
            `@layer components` while Tailwind utilities live in
            `@layer utilities` (utilities win), so FieldLegend's
            built-in `font-medium` + `data-[variant=legend]:text-base`
            silently override `.oh-legend`'s `font-weight: 800` and
            `font-size: 11px`. Effective FieldLegend rendering:
            weight 500, size 16px. SectionHeader's plain `<p>` had
            no utilities competing → rendered at 800/11px (heavier
            AND smaller than "PUBLIC HANDLE" / "WEEKLY AVAILABILITY").
            Match by adding both utilities here so the visible
            output is identical. Field-label consumers of
            `.oh-legend` (form labels in dialogs) don't ship these
            utilities, so they keep the 800/11px treatment that's
            load-bearing for tertiary chrome. */}
        <p
          id={legendId}
          className="oh-legend text-base font-medium opacity-100"
        >
          {legend}
        </p>
        {title ? (
          <h2 className="mt-3 text-[20px] font-black tracking-tight">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="mt-4 text-[13px] leading-[1.5] opacity-65">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-start">{action}</div> : null}
    </header>
  );
}
