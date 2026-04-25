"use client";

import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import {
  AvailabilityFields,
  availabilitySchema,
  defaultAvailability,
} from "./availability-fields";

// Single-purpose form: weekly availability windows. Persists via
// `schedule.save`. Apple HIG one-screen-one-purpose — handle editing
// lives on /profile, account stuff on /settings.

const schema = z.object({
  availability: availabilitySchema,
});

type FormValues = z.infer<typeof schema>;

export default function AvailabilityForm() {
  const { data: rows } = trpc.schedule.get.useQuery();

  const values = useMemo<FormValues>(
    () => ({
      availability:
        rows && rows.length > 0 ? rowsToFormValues(rows) : defaultAvailability,
    }),
    [rows],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveSchedule = useScheduleSave();

  async function onSubmit(v: FormValues) {
    await saveSchedule.mutateAsync(v.availability);
  }

  const isPending = saveSchedule.isPending;
  const isDirty = form.formState.isDirty;

  // Defer save-button state until after mount — avoids a hydration
  // mismatch between SSR (where RHF doesn't know server values) and
  // client (where `values` syncs in an effect). Same pattern the old
  // SettingsForm used.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const buttonDisabled = mounted ? isPending || !isDirty : true;
  const buttonLabel = !mounted
    ? "Saved"
    : isPending
      ? "Saving…"
      : isDirty
        ? "Save changes"
        : "Saved";

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6 sm:py-14">
          <BrutalistPageHeader kicker="Host · Availability" title="Hours" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
                  Weekly availability
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  The hours visitors can book from on your public page.
                </FieldDescription>
                <FieldGroup>
                  <AvailabilityFields />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
          <div className="bru-dash-save-spacer" aria-hidden />
        </div>

        <div className="bru-dash-save-bar" role="region" aria-label="Save changes">
          <div className="bru-dash-save-bar-inner">
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              className="w-full"
              disabled={buttonDisabled}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
