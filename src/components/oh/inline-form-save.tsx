"use client";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";

export type InlineFormSaveLabels = {
  save: string;
  saving: string;
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
  isInvalid?: boolean;
  labels: InlineFormSaveLabels;
  ariaLabel?: string;
}) {
  const mounted = useMounted();

  if (!mounted || (!isPending && !isDirty)) return null;

  const disabled = isPending || !isDirty || isInvalid;
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
        className="min-w-[100px]"
      >
        {label}
      </Button>
    </div>
  );
}
