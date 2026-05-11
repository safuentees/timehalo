"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetBookingHorizon } from "@/lib/mutations/use-set-booking-horizon";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OhCard } from "@/components/oh/oh-card";
import { InlineFormSave } from "@/components/oh/inline-form-save";
import { cn } from "@/lib/utils";

const PRESETS = [
  { days: 7 },
  { days: 14 },
  { days: 30 },
  { days: 60 },
  { days: 90 },
  { days: null }, // Unlimited
] as const;

type FormShape = {
  days: number | null;
};

const schema = z.object({
  days: z.union([
    z.literal(null),
    z.number().int().min(1).max(365),
  ]),
});

export function BookingHorizonFields() {
  const t = useTranslations("Availability");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormShape>(
    () => ({ days: me?.bookingHorizonDays ?? null }),
    [me],
  );

  const form = useForm<FormShape>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onChange",
  });

  const saveHorizon = useSetBookingHorizon();

  async function onSubmit(v: FormShape) {
    await saveHorizon.mutateAsync({ days: v.days });
    form.reset(v);
  }

  const isPending = saveHorizon.isPending;
  const isDirty = form.formState.isDirty;
  const isInvalid = !form.formState.isValid;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldSet>
          <FieldLegend className="oh-legend opacity-100">
            {t("bookingWindowLegend")}
          </FieldLegend>
          <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
            {t("bookingWindowDescription")}
          </FieldDescription>
          <FieldGroup>
            <Controller<FormShape, "days">
              name="days"
              render={({ field }) => (
                <div
                  role="radiogroup"
                  aria-labelledby="booking-window-legend"
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {PRESETS.map((preset) => {
                    const isActive = field.value === preset.days;
                    const days: number | null = preset.days;
                    const label =
                      days === null
                        ? t("bookingWindowUnlimited")
                        : days === 1
                          ? t("bookingWindowDayChip", { days })
                          : t("bookingWindowDaysChip", { days });
                    return (
                      <OhCard
                        key={preset.days ?? "unlimited"}
                        asChild
                        active={isActive}
                        className="shrink-0"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() =>
                            field.onChange(preset.days as number | null)
                          }
                          className={cn(
                            "oh-focus-ring inline-flex items-center gap-2 px-4 py-2.5 text-left transition-opacity duration-150 ease-oh",
                            isActive
                              ? "opacity-100"
                              : "opacity-65 hover:opacity-100",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "inline-block size-2 shrink-0 rounded-full transition-[background-color,box-shadow] duration-150 ease-oh",
                              isActive
                                ? "bg-[color:var(--oh-ink)]"
                                : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--oh-line-default)]",
                            )}
                          />
                          <span
                            className={cn(
                              "font-[family-name:var(--font-grotesk)] text-[13px] font-semibold leading-tight tracking-tight tabular-nums",
                            )}
                          >
                            {label}
                          </span>
                        </button>
                      </OhCard>
                    );
                  })}
                </div>
              )}
            />
          </FieldGroup>
        </FieldSet>
        <InlineFormSave
          isPending={isPending}
          isDirty={isDirty}
          isInvalid={isInvalid}
          labels={{
            save: t("saveLabel"),
            saving: t("savingLabel"),
            saved: t("savedLabel"),
          }}
        />
      </form>
    </FormProvider>
  );
}
