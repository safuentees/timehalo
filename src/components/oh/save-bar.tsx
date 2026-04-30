"use client";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

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
