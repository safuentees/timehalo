"use client";

import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Field, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getBrowserTimezone } from "@/lib/timezone";

type FormShape = { timezone: string };

export function TimezoneFields({ timezones }: { timezones: string[] }) {
  const t = useTranslations("Settings");
  const form = useFormContext<FormShape>();

  return (
    <Controller<FormShape>
      name="timezone"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <label
            className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
            htmlFor={field.name}
          >
            {t("yourTimezone")}
          </label>
          <div className="mt-3 flex flex-wrap items-stretch gap-2">
            <select
              {...field}
              id={field.name}
              aria-invalid={fieldState.invalid}
              className="bru-input flex-1 min-w-[260px] font-[family-name:var(--bru-mono)] text-[14px]"
            >
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="brutalistGhost"
              size="brutalist"
              onClick={() => {
                const detected = getBrowserTimezone();
                form.setValue("timezone", detected, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            >
              {t("useBrowser")}
            </Button>
          </div>
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="bru-field-error"
          />
        </Field>
      )}
    />
  );
}

