"use client";

import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OhSaveBar } from "@/components/oh/save-bar";
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

  // First-time visitors land on the form pre-filled from
  // `defaultAvailability` (Mon-Fri 9-5) but RHF reads that as
  // "not dirty" because form values match the seed. The save button
  // would stay gated forever — even though the visual default IS the
  // intent — and the onboarding "draw weekly hours" step would never
  // auto-check. Treat zero server rows as "needs save" so the button
  // is clickable. cal.com's setup-availability screen behaves the
  // same: unconditional save on submit.
  const seededFromDefault = (rows?.length ?? 0) === 0;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <OhPageShell>
          <OhPageHeader title="Hours" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
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
        </OhPageShell>
        <OhSaveBar
          isPending={saveSchedule.isPending}
          isDirty={form.formState.isDirty || seededFromDefault}
          labels={{
            save: "Save changes",
            saving: "Saving…",
            saved: "Saved",
          }}
        />
      </form>
    </FormProvider>
  );
}
