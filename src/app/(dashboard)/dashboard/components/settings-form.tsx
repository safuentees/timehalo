"use client";

import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const defaultValues: FormValues = {
  handle: defaultHandle,
  availability: defaultAvailability,
};

export default function SettingsForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  function onSubmit(values: FormValues) {
    alert(JSON.stringify(values, null, 2));
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
            >
              Save
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
