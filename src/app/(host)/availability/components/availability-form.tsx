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
import { BookingHorizonFields } from "./booking-horizon-fields";

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
      {/* B.PT308b — was a `<form noValidate>` wrapping everything for
          FormProvider context. HTML forbids nesting forms (MDN
          `<form>` content model, React 19 hydration check), and
          `<BookingHorizonFields>` mounts its own `<form>` for its
          per-section Save flow. RHF's FormProvider doesn't need a
          form element — it provides context via React context, so
          a plain `<div>` is enough. Per RHF docs
          (`react-hook-form.com/docs/useformcontext`): "FormProvider
          will provide the form context to your nested components"
          — no DOM requirement. The drawer-driven save flow
          (B.PT300) means this outer wrapper never owned an
          onSubmit anyway; removing the form element changes
          nothing functionally, only resolves the nested-form
          hydration error. */}
      <div>
        <OhPageShell>
          <OhPageHeader title={t("pageTitle")} />
          <div className="mt-8 flex flex-col gap-12">
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
            {/* B.PT308 — booking-window horizon. Self-contained
                section with its own form + per-section Save,
                matching the hub-page sub-section chrome from
                `dashboard-forms.md`. Sits BELOW the weekly grid
                because the weekly availability is the primary
                config; the horizon is a refinement. */}
            <BookingHorizonFields />
          </div>
        </OhPageShell>
      </div>
    </FormProvider>
  );
}
