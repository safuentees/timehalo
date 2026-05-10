"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetTimezone } from "@/lib/mutations/use-set-timezone";
import { Field, FieldError } from "@/components/ui/field";
import { OhSelect } from "@/components/oh/oh-select";
import {
  DEFAULT_TIMEZONE,
  getBrowserTimezone,
  timezoneSchema,
} from "@/lib/timezone";
import { SectionHeader } from "@/components/oh/section-header";
import { InlineFormSave } from "@/components/oh/inline-form-save";

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
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          suppressHydrationWarning
        >
          <SectionHeader
            legendId="timezone-legend"
            legend={t("timezoneLegend")}
            description={t("timezoneDescription")}
          />
          <Controller<FormShape>
            name="timezone"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="mt-5">
                <OhSelect
                  {...field}
                  id={field.name}
                  aria-labelledby="timezone-legend"
                  aria-invalid={fieldState.invalid}
                  className="min-w-[260px] font-[family-name:var(--oh-mono)] text-[14px]"
                >
                  {timezones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </OhSelect>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                  className="oh-field-error"
                />
              </Field>
            )}
          />

          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                const detected = getBrowserTimezone();
                form.setValue("timezone", detected, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              className="oh-focus-ring rounded-(--oh-r-xs) text-[13px] underline underline-offset-4 decoration-[1.5px] decoration-current opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
            >
              {t("useBrowser")}
            </button>
          </div>

          <InlineFormSave
            isPending={isPending}
            isDirty={isDirty}
            labels={{
              save: t("save"),
              saving: t("saving"),
              saved: t("saved"),
            }}
          />
        </form>
      </FormProvider>
    </section>
  );
}
