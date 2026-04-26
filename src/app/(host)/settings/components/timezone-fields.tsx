"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Field, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getBrowserTimezone } from "@/lib/timezone";

// IANA timezone picker. Uses the runtime's full list when available
// (Node 18+, every modern browser), falls back to a hand-curated
// short list otherwise. The "Use browser timezone" button copies
// `Intl.DateTimeFormat().resolvedOptions().timeZone` into the field
// — covers the 90% case where a host's machine is already set right.

type FormShape = { timezone: string };

export function TimezoneFields() {
  const t = useTranslations("Settings");
  const form = useFormContext<FormShape>();

  const zones = useMemo(() => {
    if (typeof Intl.supportedValuesOf === "function") {
      try {
        return Intl.supportedValuesOf("timeZone");
      } catch {
        // Fall through.
      }
    }
    return FALLBACK_ZONES;
  }, []);

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
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
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

// Tiny offline fallback. Older runtimes without
// Intl.supportedValuesOf still get a working picker.
const FALLBACK_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];
