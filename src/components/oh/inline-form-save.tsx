"use client";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

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
