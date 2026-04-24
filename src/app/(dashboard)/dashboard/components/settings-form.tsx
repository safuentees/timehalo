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
  const isDirty = form.formState.isDirty;

  // Defer form-state-driven button rendering to a post-mount pass. Back/forward
  // nav in Next.js 16 + Turbopack can re-hydrate this tree with a queryClient
  // state that differs from the server's dehydrated snapshot; RHF's `values`
  // sync runs in an effect, so `isDirty` can momentarily disagree between the
  // server HTML and the client's first paint. Holding a stable initial state
  // until after mount avoids the hydration mismatch without changing UX.
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
