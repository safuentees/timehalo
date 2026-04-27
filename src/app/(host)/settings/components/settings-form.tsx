"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMounted } from "@/hooks/use-mounted";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetTimezone } from "@/lib/mutations/use-set-timezone";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { timezoneSchema, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { TimezoneFields } from "./timezone-fields";
import { LanguageFields } from "./language-fields";
import { ThemeFields } from "./theme-fields";
import { CalendarFields } from "./calendar-fields";
import { DeleteAccountDialog } from "./delete-account-dialog";

const schema = z.object({
  timezone: timezoneSchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm() {
  const tSettings = useTranslations("Settings");
  const tDanger = useTranslations("DangerZone");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({ timezone: me?.timezone ?? DEFAULT_TIMEZONE }),
    [me],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveTimezone = useSetTimezone();

  async function onSubmit(v: FormValues) {
    await saveTimezone.mutateAsync({ timezone: v.timezone });
    form.reset({ timezone: v.timezone });
  }

  const isPending = saveTimezone.isPending;
  const isDirty = form.formState.isDirty;

  const mounted = useMounted();
  const buttonDisabled = mounted ? isPending || !isDirty : true;
  const buttonLabel = !mounted
    ? tSettings("saved")
    : isPending
      ? tSettings("saving")
      : isDirty
        ? tSettings("save")
        : tSettings("saved");

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <BrutalistPageShell>
          <BrutalistPageHeader title={tSettings("title")} />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
                  {tSettings("timezoneLegend")}
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  {tSettings("timezoneDescription")}
                </FieldDescription>
                <FieldGroup>
                  <TimezoneFields />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>

          <div className="mt-12 border-t-2 border-bru-line pt-10">
            <LanguageFields />
          </div>

          <div className="mt-12 border-t-2 border-bru-line pt-10">
            <ThemeFields />
          </div>

          <div className="mt-12 border-t-2 border-bru-line pt-10">
            <CalendarFields />
          </div>

          <section className="mt-16 border-t-2 border-bru-line-strong pt-10">
            <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
              {tDanger("label")}
            </p>
            <h2 className="mt-3 text-[20px] font-black tracking-tight">
              {tDanger("deleteAccountTitle")}
            </h2>
            <p className="mt-3 text-[13px] leading-[1.5] opacity-65 max-w-prose">
              {tDanger("deleteAccountDescription")}
            </p>
            <div className="mt-5">
              <DeleteAccountDialog />
            </div>
          </section>

          <div className="bru-dash-save-spacer" aria-hidden />
        </BrutalistPageShell>

        <div className="bru-dash-save-bar" role="region" aria-label="Save changes">
          <div className="bru-dash-save-bar-inner">
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              className="w-full"
              disabled={buttonDisabled}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
