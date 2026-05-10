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
  /**
   * Optional. Pre-B.PT299 the button cycled through THREE labels —
   * `save` (dirty) / `saving` (pending) / `saved` (clean). User
   * feedback: the "Saved" state read as redundant noise (the
   * disabled button + visible form values already convey "no
   * changes to save"). Now the button shows just `save` in idle
   * states (disabled when clean) and `saving` while pending. Kept
   * the field optional so existing callsites that still pass
   * `saved: t("...")` don't break.
   */
  saved?: string;
};

export function InlineFormSave({
  isPending,
  isDirty,
  isInvalid = false,
  labels,
  ariaLabel,
}: {
  isPending: boolean;
  isDirty: boolean;
  /**
   * Optional. When true, the button is disabled regardless of `isDirty`.
   * Use for forms where a field has a live async-validation step
   * whose result must gate save (e.g. profile handle "taken" check) —
   * the parent passes `!form.formState.isValid` so server-detected
   * errors surfaced via `setError()` short-circuit submit.
   */
  isInvalid?: boolean;
  labels: InlineFormSaveLabels;
  /** Optional override; defaults to the localized save label so SR announces in-language. */
  ariaLabel?: string;
}) {
  const mounted = useMounted();

  // 2026-05-09 — hide when there's nothing to save. The previous
  // shape rendered the button always, just disabled when undirty.
  // On hub pages with multiple sections (`/profile` ships
  // HandleFields + BioFields, each with its own InlineFormSave),
  // that meant 2+ visible (but inert) Save buttons stacked down
  // the column — visual noise the user reported as cluttered.
  //
  // Pattern reference: GitHub / Linear / Vercel all hide their
  // section save action when no field is dirty; cal.com tried
  // outright autosave (PR #14849) and reverted because of duplicate
  // toasts + unclear save state, so they're back to explicit
  // saves but only when there's actually pending work. We follow
  // the latter — explicit, no surprise, but invisible at rest.
  //
  // Visibility rules:
  //   - Pre-mount: HIDE. RHF starts fresh with isDirty=false; the
  //     button shouldn't appear before the user has done anything.
  //     SSR + first client render both return null → no hydration
  //     mismatch (both render nothing).
  //   - Mounted + dirty: render (enabled, ready to save)
  //   - Mounted + pending: render (disabled, label = saving)
  //   - Mounted + invalid + dirty: render (disabled — user sees
  //     a CTA they can't yet click, prompting them to fix the
  //     field; matches cal.com's `SectionBottomActions` shape)
  //   - Mounted + clean + idle + valid: HIDE — no work to do.
  if (!mounted || (!isPending && !isDirty)) return null;

  const disabled = isPending || !isDirty || isInvalid;
  // B.PT299 — simplified to two labels. `saving` while pending,
  // `save` otherwise.
  const label = isPending ? labels.saving : labels.save;

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
        // B.PT299 — `min-w-[100px]` (was 160px). The longer "Save
        // changes" copy needed 160 to fit across all three label
        // states; with the simplified two-label vocabulary the
        // button content is short enough that 100px is a
        // comfortable floor while keeping the click target above
        // 44px (Apple HIG / WCAG 2.5.8).
        className="min-w-[100px]"
      >
        {label}
      </Button>
    </div>
  );
}
