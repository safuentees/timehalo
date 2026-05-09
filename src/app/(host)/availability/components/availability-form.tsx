"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { rowsToFormValues } from "@/lib/schedule";
import { useScheduleSave } from "@/lib/mutations/use-schedule-save";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import {
  AvailabilityFields,
  availabilitySchema,
  defaultAvailability,
} from "./availability-fields";

// Single-purpose form: weekly availability windows. Persists via
// `schedule.save`.
//
// B.PT300 — single-save UX. Was: drawer "Save" committed to form
// local state + outer `<InlineFormSave>` persisted to server (two
// steps, ambiguous). Now: drawer "Save" persists DIRECTLY to the
// server in one action; outer button removed entirely. The drawer's
// save button shows the pending state and stays open until the
// mutation succeeds — error keeps the drawer up so the user can
// retry. Each block edit is one atomic save (fine for the small
// data set: hosts typically have 1-7 blocks total).
//
// Cal.com runs the inverse pattern (single page-level save, no
// drawer; their schedule edits are inline) — but they don't have
// a drawer-based block editor. We took their principle ("ONE save
// action, owned where the work happens") and applied it to OUR
// surface: in our case, the work happens in the drawer.

const schema = z.object({
  availability: availabilitySchema,
});

type FormValues = z.infer<typeof schema>;

export default function AvailabilityForm() {
  const t = useTranslations("Availability");
  const { data: rows } = trpc.schedule.get.useQuery();

  const values = useMemo<FormValues>(
    () => ({
      availability:
        rows && rows.length > 0 ? rowsToFormValues(rows) : defaultAvailability,
    }),
    [rows],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveSchedule = useScheduleSave();

  return (
    <FormProvider {...form}>
      {/* Form element kept for the FormProvider context (RHF needs it
          for register/setValue) but no `onSubmit` — saves now happen
          via the drawer's `<AvailabilityFields onPersist={...}>`
          callback. The `noValidate` prevents the browser's native
          submit on Enter from firing a blank submit. */}
      <form noValidate>
        <OhPageShell>
          <OhPageHeader title={t("pageTitle")} />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="oh-legend opacity-100">
                  {t("weeklyLegend")}
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  {t("weeklyDescription")}
                </FieldDescription>
                <FieldGroup>
                  <AvailabilityFields
                    onPersist={(schedule) =>
                      saveSchedule.mutateAsync(schedule)
                    }
                    isPersisting={saveSchedule.isPending}
                  />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
        </OhPageShell>
      </form>
    </FormProvider>
  );
}
