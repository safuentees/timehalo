"use client";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

// Inline commit affordance for full-page forms (`/profile`,
// `/availability`, future single-purpose pages). Sits at the bottom of
// the page-shell, scrolls with content, separated from the last field
// by whitespace alone — the prominent filled button reads as the
// action zone without a hard rule.
//
// Replaces the previous sticky `OhSaveBar` island. Audit on
// 2026-04-29: cal.com (`SectionBottomActions` → `apps/web/modules/...`)
// and dub.co (`Form` primitive in `@dub/ui`) both render their save
// affordance INLINE at the bottom of the form column. Neither uses a
// position-fixed bottom bar. Settings sub-sections in this repo
// already commit inline; using the same shape on full-page forms
// gives the host one save vocabulary across the dashboard.
//
// Mount-gating: RHF's `isDirty` resolves only client-side. The `availability`
// page also seeds dirty=true from the server when the host has zero
// AvailabilityRange rows (so first-time visitors can save the default
// Mon–Fri 9–5 in one click). Both cases would re-paint the button
// label between SSR and CSR — `useMounted()` keeps the SSR pass and
// the first client paint identical (label "Saved", disabled), then
// upgrades after mount.

export type InlineFormSaveLabels = {
  save: string;
  saving: string;
  saved: string;
};

export function InlineFormSave({
  isPending,
  isDirty,
  labels,
  ariaLabel,
}: {
  isPending: boolean;
  isDirty: boolean;
  labels: InlineFormSaveLabels;
  /** Optional override; defaults to the localized save label so SR announces in-language. */
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
    <div
      className="mt-10 flex justify-end"
      role="region"
      aria-label={ariaLabel ?? labels.save}
    >
      <Button
        type="submit"
        variant="oh"
        size="oh"
        disabled={disabled}
        className="min-w-[160px]"
      >
        {label}
      </Button>
    </div>
  );
}
