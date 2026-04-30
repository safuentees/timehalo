"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetTimezone } from "@/lib/mutations/use-set-timezone";
import { Field, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_TIMEZONE,
  getBrowserTimezone,
  timezoneSchema,
} from "@/lib/timezone";
import { SectionHeader } from "@/components/brutalist/section-header";

type FormShape = { timezone: string };

const schema = z.object({ timezone: timezoneSchema });

export function TimezoneFields({ timezones }: { timezones: string[] }) {
  const t = useTranslations("Settings");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormShape>(
    () => ({ timezone: me?.timezone ?? DEFAULT_TIMEZONE }),
    [me],
  );

  const form = useForm<FormShape>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveTimezone = useSetTimezone();

  async function onSubmit(v: FormShape) {
    await saveTimezone.mutateAsync({ timezone: v.timezone });
    form.reset({ timezone: v.timezone });
  }

  const isPending = saveTimezone.isPending;
  const isDirty = form.formState.isDirty;

  return (
    <section aria-labelledby="timezone-legend">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
                  className="bru-input w-full min-w-[260px] font-[family-name:var(--oh-mono)] text-[14px]"
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
              </Field>
            )}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              disabled={isPending || !isDirty}
              className="ml-auto"
            >
              {isPending ? t("saving") : isDirty ? t("save") : t("saved")}
            </Button>
          </div>
        </form>
      </FormProvider>
    </section>
  );
}
