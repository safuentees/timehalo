"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetBookingHorizon } from "@/lib/mutations/use-set-booking-horizon";
import { Field, FieldError } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SectionHeader } from "@/components/oh/section-header";
import { InlineFormSave } from "@/components/oh/inline-form-save";

// B.PT308 — booking-window horizon section on /availability. Self-
// contained: owns its form, mutation, Save button. Matches the per-
// section commit pattern used by TimezoneFields + HandleFields + the
// rest of the hub-page sub-sections.
//
// Storage shape: `User.bookingHorizonDays Int?` — null = unlimited
// (no cap; visitor sees the procedure's hard ceiling of 365 days),
// otherwise a number of ROLLING CALENDAR DAYS. The form represents
// "unlimited" as the toggle being OFF and "limited" as toggle ON
// with a number input. Submitting persists `days: null` for OFF
// and `days: N` for ON.
//
// Reference: cal.com `EventLimitsTab` (packages/features/eventtypes/
// components/tabs/limits/EventLimitsTab.tsx) — they use the same
// toggle + radio (Rolling / Range) pattern. We collapse to a single
// toggle + number input because the Range / Rolling-Window variants
// are rare on single-host surfaces; reachable later via an extra
// field on the same row if a host asks for them.

const DEFAULT_HORIZON_DAYS = 30;
const HORIZON_MIN_DAYS = 1;
const HORIZON_MAX_DAYS = 365;

type FormShape = {
  limitEnabled: boolean;
  days: number;
};

const schema = z.object({
  limitEnabled: z.boolean(),
  days: z
    .number({ error: "Enter a number" })
    .int("Whole days only")
    .min(HORIZON_MIN_DAYS, `At least ${HORIZON_MIN_DAYS} day`)
    .max(HORIZON_MAX_DAYS, `At most ${HORIZON_MAX_DAYS} days`),
});

export function BookingHorizonFields() {
  const t = useTranslations("Availability");
  const { data: me } = trpc.users.me.useQuery();

  // Seed the form. `bookingHorizonDays = null` → toggle off + days =
  // default placeholder (so flipping the toggle on doesn't show
  // an empty field). `bookingHorizonDays = N` → toggle on + days N.
  const values = useMemo<FormShape>(
    () => ({
      limitEnabled: me?.bookingHorizonDays != null,
      days: me?.bookingHorizonDays ?? DEFAULT_HORIZON_DAYS,
    }),
    [me],
  );

  const form = useForm<FormShape>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveHorizon = useSetBookingHorizon();

  async function onSubmit(v: FormShape) {
    const next = v.limitEnabled ? v.days : null;
    await saveHorizon.mutateAsync({ days: next });
    form.reset(v);
  }

  const limitEnabled = form.watch("limitEnabled");
  const isPending = saveHorizon.isPending;
  const isDirty = form.formState.isDirty;

  return (
    <section aria-labelledby="booking-horizon-legend">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} suppressHydrationWarning>
          {/* Header row carries both the legend/description AND the
              toggle. Toggle-at-end is the cal.com convention for
              "enable this whole section"; matches our existing
              Switch usage in calendar-pick-dialog. */}
          <div className="flex items-start justify-between gap-4">
            <SectionHeader
              legendId="booking-horizon-legend"
              legend={t("bookingWindowLegend")}
              description={t("bookingWindowDescription")}
            />
            <Controller<FormShape, "limitEnabled">
              name="limitEnabled"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  aria-labelledby="booking-horizon-legend"
                  className="mt-1 shrink-0"
                />
              )}
            />
          </div>

          {/* Number input — only rendered when the limit toggle is on.
              Hidden (not just disabled) so the field row doesn't
              read as "broken input." Matches the SettingsToggle
              children pattern in cal.com EventLimitsTab. */}
          {limitEnabled ? (
            <div className="mt-5">
              <Controller<FormShape, "days">
                name="days"
                render={({ field, fieldState }) => {
                  const numericValue =
                    typeof field.value === "number" ? field.value : Number.NaN;
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <label
                        htmlFor={field.name}
                        className="oh-eyebrow opacity-100"
                      >
                        {t("bookingWindowDaysLabel")}
                      </label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          id={field.name}
                          type="number"
                          inputMode="numeric"
                          min={HORIZON_MIN_DAYS}
                          max={HORIZON_MAX_DAYS}
                          value={
                            Number.isFinite(numericValue) ? numericValue : ""
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.onChange(
                              raw === "" ? Number.NaN : Number(raw),
                            );
                          }}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          aria-invalid={fieldState.invalid}
                          className="oh-focus-ring w-[100px] rounded-(--oh-r-sm) border border-oh-line bg-[color:var(--oh-paper)] px-3 py-2 font-[family-name:var(--oh-mono)] text-[14px] tabular-nums text-[color:var(--oh-ink)] outline-none transition-[border-color] duration-150 ease-oh focus:border-oh-line-strong"
                        />
                        <span className="oh-eyebrow opacity-55">
                          {numericValue === 1
                            ? t("bookingWindowDayUnit")
                            : t("bookingWindowDaysUnit")}
                        </span>
                      </div>
                      <FieldError
                        errors={
                          fieldState.error ? [fieldState.error] : undefined
                        }
                        className="oh-field-error"
                      />
                    </Field>
                  );
                }}
              />
            </div>
          ) : null}

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
