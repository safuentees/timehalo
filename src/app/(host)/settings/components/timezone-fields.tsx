"use client";

import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Field, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { getBrowserTimezone } from "@/lib/timezone";
import { SectionHeader } from "./section-header";

// IANA timezone picker. The zone list is resolved server-side and
// passed in as a prop — Node ICU and browser ICU disagree on aliases
// (Africa/Asmera vs Africa/Asmara), so deriving it on the client
// would diverge from the SSR HTML and trip hydration.
//
// "Use browser" copies Intl.DateTimeFormat().resolvedOptions().timeZone
// into the field — covers the 90% case where the host's machine is
// already set right. It lives next to the input (input modifier),
// not in the section header (which is reserved for primary actions).

type FormShape = { timezone: string };

export function TimezoneFields({ timezones }: { timezones: string[] }) {
  const t = useTranslations("Settings");
  const form = useFormContext<FormShape>();

  return (
    <section>
      <SectionHeader
        legendId="timezone-legend"
        legend={t("timezoneLegend")}
        description={t("timezoneDescription")}
      />
      <Controller<FormShape>
        name="timezone"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="mt-5">
            <select
              {...field}
              id={field.name}
              aria-labelledby="timezone-legend"
              aria-invalid={fieldState.invalid}
              className="bru-input w-full min-w-[260px] font-[family-name:var(--bru-mono)] text-[14px]"
            >
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <FieldError
              errors={fieldState.error ? [fieldState.error] : undefined}
              className="bru-field-error"
            />
            <Button
              type="button"
              variant="brutalistGhost"
              size="brutalist"
              className="mt-3 self-start"
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
          </Field>
        )}
      />
    </section>
  );
}
