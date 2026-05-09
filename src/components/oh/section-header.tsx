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
      {/* Inner column matches availability/profile's `<FieldSet>`
          layout exactly so the legend → description rhythm is
          pixel-identical:
            • `flex flex-col gap-4` mirrors FieldSet's gap-4 (16px).
            • Legend carries `mb-1.5` (FieldLegend's default) + the
              cascade-layer-beating `text-base font-medium` so the
              utility-layer rules win over `.oh-legend`'s 11px / 800
              components-layer rules (effective: 16px / 500).
            • Description carries `-mt-1.5` ([[data-variant=legend]+&]:
              -mt-1.5 from FieldDescription's default — fires when the
              previous sibling is a legend variant), pulling it tight
              against the legend's bottom margin.
          Net visible content-to-content gap:
            6 (legend mb) + 16 (flex gap) + (-6) (description -mt) = 16px
          — the same number availability/profile render. Field-label
          consumers of `.oh-legend` (form labels in dialogs) ship
          neither the utilities nor this layout, so they keep the
          smaller / heavier treatment load-bearing for tertiary roles. */}
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
