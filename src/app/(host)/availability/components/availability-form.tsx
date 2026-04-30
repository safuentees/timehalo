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
import { InlineFormSave } from "@/components/oh/inline-form-save";
import {
  AvailabilityFields,
  availabilitySchema,
  defaultAvailability,
} from "./availability-fields";

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

  const seededFromDefault = (rows?.length ?? 0) === 0;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <OhPageShell>
          <OhPageHeader title="Hours" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="oh-legend opacity-100">
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
          <InlineFormSave
            isPending={saveSchedule.isPending}
            isDirty={form.formState.isDirty || seededFromDefault}
            labels={{
              save: "Save changes",
              saving: "Saving…",
              saved: "Saved",
            }}
          />
        </OhPageShell>
      </form>
    </FormProvider>
  );
}
