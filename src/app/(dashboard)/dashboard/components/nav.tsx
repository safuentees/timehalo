"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";

const schema = z.object({
  handle: z
    .string()
    .min(3, "3+ characters")
    .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens"),
});

type FormValues = z.infer<typeof schema>;

export default function HandleForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { handle: "" },
  });

  function onSubmit(values: FormValues) {
    alert(`Would save handle: ${values.handle}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <FieldSet>
          <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
            Handle
          </FieldLegend>
          <FieldGroup>
            <Controller
              name="handle"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <BrutalistInputGroup>
                    <BrutalistInputGroupInput
                      {...field}
                      id={field.name}
                      placeholder="alex"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-invalid={fieldState.invalid}
                    />
                    <BrutalistInputGroupAddon align="inline-start">
                      <BrutalistInputGroupText>/h/</BrutalistInputGroupText>
                    </BrutalistInputGroupAddon>
                  </BrutalistInputGroup>
                  <FieldError
                    errors={fieldState.error ? [fieldState.error] : undefined}
                    className="font-[family-name:var(--bru-mono)] text-[9.5px] font-bold tracking-[2.5px] uppercase"
                  />
                </Field>
              )}
            />
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
  );
}
