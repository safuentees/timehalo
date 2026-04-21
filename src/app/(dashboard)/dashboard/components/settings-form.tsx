"use client";

import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
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

const schema = z.object({
  handle: handleFieldSchema,
  availability: availabilitySchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm() {
  const utils = trpc.useUtils();
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

  const save = trpc.schedule.save.useMutation({
    onSuccess: async () => {
      await utils.schedule.get.invalidate();
    },
  });

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

          <Field orientation="horizontal" className="items-center justify-between">
            <span
              aria-live="polite"
              className="font-[family-name:var(--bru-mono)] text-[10px] font-bold tracking-[2px] uppercase"
            >
              {save.error ? (
                <span className="text-destructive">
                  {save.error.message ?? "save failed"}
                </span>
              ) : save.isSuccess ? (
                <span className="opacity-65">saved</span>
              ) : null}
            </span>
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
