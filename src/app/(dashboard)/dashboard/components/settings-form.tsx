"use client";

import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import { useSetHandle } from "@/lib/mutations/use-set-handle";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import {
  HandleFields,
  handleFieldSchema,
  defaultHandle,
} from "./handle-fields";
import {
  AvailabilityFields,
  availabilitySchema,
  defaultAvailability,
} from "./availability-fields";

const schema = z.object({
  handle: handleFieldSchema,
  availability: availabilitySchema,
});

type FormValues = z.infer<typeof schema>;

export default function SettingsForm() {
  const { data: rows } = trpc.schedule.get.useQuery();
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({
      handle: me?.handle ?? defaultHandle,
      availability:
        rows && rows.length > 0 ? rowsToFormValues(rows) : defaultAvailability,
    }),
    [me, rows],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveSchedule = useScheduleSave();
  const saveHandle = useSetHandle({
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        form.setError("handle", {
          type: "server",
          message: error.message,
        });
      }
    },
  });

  async function onSubmit(v: FormValues) {
    form.clearErrors("handle");

    await Promise.allSettled([
      saveHandle.mutateAsync({ handle: v.handle }),
      saveSchedule.mutateAsync(v.availability),
    ]);
  }

  const isPending = saveSchedule.isPending || saveHandle.isPending;
  const isDirty = form.formState.isDirty;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
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
        <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10">
          <FieldGroup>
            <FieldSet>
              <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
                Handle
              </FieldLegend>
              <FieldGroup>
                <HandleFields />
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
                Availability
              </FieldLegend>
              <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                Weekly windows visitors can book from.
              </FieldDescription>
              <FieldGroup>
                <AvailabilityFields />
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
          <div className="bru-dash-save-spacer" aria-hidden />
        </div>

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
