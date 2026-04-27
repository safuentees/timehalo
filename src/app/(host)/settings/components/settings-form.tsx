"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetTimezone } from "@/lib/mutations/use-set-timezone";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { BrutalistSaveBar } from "@/components/brutalist/save-bar";
import { timezoneSchema, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { TimezoneFields } from "./timezone-fields";
import { LanguageFields } from "./language-fields";
import { ThemeFields } from "./theme-fields";
import { WorkflowFields } from "./workflow-fields";
import { CalendarFields } from "./calendar-fields";
import { ApiKeysFields } from "./api-keys-fields";
import { DeleteAccountDialog } from "./delete-account-dialog";

const schema = z.object({
  timezone: timezoneSchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm({ timezones }: { timezones: string[] }) {
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

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <BrutalistPageShell tight>
          <BrutalistPageHeader title={tSettings("title")} />
          <div className="mt-8 flex flex-col gap-12">
            <TimezoneFields timezones={timezones} />
            <LanguageFields />
            <ThemeFields />
            <WorkflowFields />
            <CalendarFields />
            <ApiKeysFields />
          </div>

          <section className="mt-16">
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

        </BrutalistPageShell>
        <BrutalistSaveBar
          isPending={saveTimezone.isPending}
          isDirty={form.formState.isDirty}
          labels={{
            save: tSettings("save"),
            saving: tSettings("saving"),
            saved: tSettings("saved"),
          }}
        />
      </form>
    </FormProvider>
  );
}
