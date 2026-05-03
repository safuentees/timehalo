"use client";

import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Field, FieldError } from "@/components/ui/field";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";

export const handleFieldSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const defaultHandle = "";

type FormShape = { handle: string };

export function HandleFields() {
  const t = useTranslations("Profile");
  return (
    <Controller<FormShape>
      name="handle"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <OhInputGroup>
            <OhInputGroupInput
              {...field}
              id={field.name}
              placeholder={t("handlePlaceholder")}
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
