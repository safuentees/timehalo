"use client";

import { Controller } from "react-hook-form";
import { z } from "zod";
import { Field, FieldError } from "@/components/ui/field";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";

export const handleFieldSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const defaultHandle = "";

type FormShape = { handle: string };

export function HandleFields() {
  return (
    <Controller<FormShape>
      name="handle"
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
            className="font-[family-name:var(--oh-mono)] text-[9.5px] font-bold tracking-[2.5px] uppercase"
          />
        </Field>
      )}
    />
  );
}
