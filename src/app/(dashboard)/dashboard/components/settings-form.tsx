"use client";

import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import {
  HandleFields,
  handleFieldSchema,
  defaultHandle,
} from "./handle-fields";
import {
  AvailabilityFields,
  availabilitySchema,
  defaultAvailability,
} from "./availability-fields";

/**
 * One form, one useForm. Wrapped in FormProvider so child sections
 * (HandleFields, AvailabilityFields) read the form instance from context
 * instead of receiving `control` as a prop.
 *
 * Data flow:
 *   - `trpc.schedule.get.useQuery()` reads the prefetched cache
 *     populated on the server by HydrationBoundary → instant data,
 *     no loading flash on first paint.
 *   - Pass the result to useForm's `values` prop so the form stays
 *     in sync when the query revalidates. `keepDirtyValues: true`
 *     preserves unsaved edits if a background refetch happens.
 *   - Save goes through `useScheduleSave`, a custom hook that bakes in
 *     the toast side effect. The component only calls `.mutate(...)`.
 */

const schema = z.object({
  handle: handleFieldSchema,
  availability: availabilitySchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm() {
  const { data: rows } = trpc.schedule.get.useQuery();

  const values = useMemo<FormValues>(
    () => ({
      handle: defaultHandle,
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

  const save = useScheduleSave();

  function onSubmit(v: FormValues) {
    save.mutate(v.availability);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
              Handle
            </FieldLegend>
            <FieldGroup>
              <HandleFields />
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
              Availability
            </FieldLegend>
            <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
              Weekly windows visitors can book from.
            </FieldDescription>
            <FieldGroup>
              <AvailabilityFields />
            </FieldGroup>
          </FieldSet>

          <Field orientation="horizontal" className="justify-end">
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              className="w-full sm:w-auto"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
