"use client";

import { Controller } from "react-hook-form";
import { z } from "zod";
import { Field, FieldError } from "@/components/ui/field";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";

// Just the zod shape for the handle piece. The parent form composes this
// with other section schemas into one combined schema.
export const handleFieldSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const defaultHandle = "";

// Local typing so Controller's name/field.value are strongly typed
// without this file having to know the full SettingsValues shape.
type FormShape = { handle: string };

/**
 * Presentational section rendered inside a parent FormProvider.
 * `Controller` auto-reads `control` from FormProvider context — no prop.
 */
export function HandleFields() {
  return (
    <Controller<FormShape>
      name="handle"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <OhInputGroup>
            <OhInputGroupInput
              {...field}
              id={field.name}
              placeholder="alex"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={fieldState.invalid}
            />
            <OhInputGroupAddon align="inline-start">
              <OhInputGroupText>/h/</OhInputGroupText>
            </OhInputGroupAddon>
          </OhInputGroup>
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="font-[family-name:var(--oh-mono)] text-[9.5px] font-bold tracking-[2.5px] uppercase"
          />
        </Field>
      )}
    />
  );
}
