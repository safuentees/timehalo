"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Field, FieldError } from "@/components/ui/field";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";

// Just the zod shape for the handle piece. The parent form composes this
// with other section schemas into one combined schema.
export const handleFieldSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const defaultHandle = "";

/**
 * Renders only the handle input wired to the parent form via `control`.
 * No <form>, no useForm, no submit button. The parent owns the form.
 */
export function HandleFields<TFieldValues extends { handle: string }>({
  control,
  name = "handle" as FieldPath<TFieldValues>,
}: {
  control: Control<TFieldValues>;
  name?: FieldPath<TFieldValues>;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <BrutalistInputGroup>
            <BrutalistInputGroupInput
              {...field}
              value={(field.value as string) ?? ""}
              id={String(field.name)}
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
  );
}
