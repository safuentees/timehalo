"use client";

import { useMemo } from "react";
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

const schema = z.object({
  timezone: timezoneSchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm() {
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
    ? "Saved"
    : isPending
      ? "Saving…"
      : isDirty
        ? "Save changes"
        : "Saved";

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <BrutalistPageShell>
          <BrutalistPageHeader title="Account" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
                  Timezone
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  Your weekly hours interpret in this zone. Slot times
                  shown to visitors convert from this zone to UTC, then
                  render in their local time.
                </FieldDescription>
                <FieldGroup>
                  <TimezoneFields />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
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
