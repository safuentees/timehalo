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
import { OhSelect } from "@/components/oh/oh-select";
import {
  DEFAULT_TIMEZONE,
  getBrowserTimezone,
  timezoneSchema,
} from "@/lib/timezone";
import { SectionHeader } from "@/components/oh/section-header";

// IANA timezone picker. Self-contained — owns its own form, mutation,
// and Save button. Per-section commits match the cal.com / dub.co
// pattern; the previous global <OhSaveBar> on /settings was
// theatrical (only saved timezone, but visually claimed to save the
// whole page). Other sections (language, theme, workflows, calendar,
// API keys) commit through their own paths.
//
// Zone list resolved server-side and passed as a prop — Node ICU and
// browser ICU disagree on aliases (Africa/Asmera vs Africa/Asmara),
// so deriving on the client would diverge from the SSR HTML and trip
// hydration. See src/app/(host)/settings/page.tsx.

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
        {/* Chrome's autofill / form-discovery scanner injects
            `__gcruniqueid` onto every `<form>` it inspects, BEFORE
            React hydrates on slower first loads — see the matching
            comment on `<select>` in `src/components/oh/oh-select.tsx`
            for the full story. `suppressHydrationWarning` is the
            React 19 escape hatch documented in the Next hydration-
            error guide for browser-injected attributes. */}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
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
              variant="oh"
              size="oh"
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
