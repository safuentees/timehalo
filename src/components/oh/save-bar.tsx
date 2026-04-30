"use client";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

// Sticky bottom save bar — the canonical commit affordance for every
// dashboard form (Settings, Profile, Availability, future ones). Lives
// inside the <form>'s submit chain so Enter still submits naturally,
// and pairs with .oh-dash-save-spacer so the last section never sits
// directly under the bar's island.
//
// Pattern is the same one cal.com / Vercel / Linear / Stripe / Notion
// use for dashboard forms — sticky paper island at the column footer
// that stays in reach without covering content. Vercel rolled out a
// "floating bottom bar optimized for one-handed use on mobile" in
// Feb 2026; same idiom.
//
// Mount-gating: the disabled flag and label depend on RHF's `isDirty`
// which only resolves client-side (SSR has no form state). Render the
// "Saved" / disabled state during SSR + first paint, then upgrade after
// mount. Avoids the hydration mismatch the original copy-pasted code
// also handled, just centralized here.

export type SaveBarLabels = {
  save: string;
  saving: string;
  saved: string;
};

export function OhSaveBar({
  isPending,
  isDirty,
  labels,
  ariaLabel,
}: {
  isPending: boolean;
  isDirty: boolean;
  labels: SaveBarLabels;
  /** Optional override; defaults to the i18n save label so screen readers announce in-language. */
  ariaLabel?: string;
}) {
  const mounted = useMounted();
  const disabled = mounted ? isPending || !isDirty : true;
  const label = !mounted
    ? labels.saved
    : isPending
      ? labels.saving
      : isDirty
        ? labels.save
        : labels.saved;

  return (
    <>
      <div className="oh-dash-save-spacer" aria-hidden />
      <div
        className="oh-dash-save-bar"
        role="region"
        aria-label={ariaLabel ?? labels.save}
      >
        <div className="oh-dash-save-bar-inner">
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            className="w-full"
            disabled={disabled}
          >
            {label}
          </Button>
        </div>
      </div>
    </>
  );
}
