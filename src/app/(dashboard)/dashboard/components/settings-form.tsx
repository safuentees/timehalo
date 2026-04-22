"use client";

import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import { useSetHandle } from "@/lib/mutations/use-set-handle";
import { Button } from "@/components/ui/button";
import {
  Field,
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

/**
 * One form, two mutations running in parallel on submit:
 *
 *   schedule.save   — persists the weekly availability
 *   users.setHandle — persists the handle
 *
 * Both are fired via `mutateAsync` inside `Promise.allSettled` so one
 * failing doesn't abort the other. CONFLICT on the handle is mapped to
 * a field-level error via `form.setError`, so the user sees "taken"
 * under the handle input instead of a generic toast.
 */

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
      // CONFLICT = handle taken. Attach to the field so the user sees
      // the error inline instead of just in a toast.
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

    // Fire both in parallel. allSettled so a handle CONFLICT doesn't
    // prevent the schedule from saving (and vice versa). Each mutation
    // reports its own success/error via its custom hook.
    await Promise.allSettled([
      saveHandle.mutateAsync({ handle: v.handle }),
      saveSchedule.mutateAsync(v.availability),
    ]);
  }

  const isPending = saveSchedule.isPending || saveHandle.isPending;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
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

          <Field orientation="horizontal" className="justify-end">
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              className="w-full sm:w-auto"
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
