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

// B.PT308 — booking-window horizon section. Self-contained: owns its
// form + mutation + InlineFormSave, mirroring BioFields /
// HandleFields / DurationFields on /profile.
//
// Chrome: FieldSet + FieldLegend + FieldDescription (matches the
// profile-page sub-section hierarchy — no bordered card wrapping the
// whole section). Inside, the picker is a row of preset OhCard chips
// — the project's depth-chrome primitive, same one workspaces / event-
// types / api-keys lists use. Each chip is a button rendered through
// OhCard's `asChild` + Slot polymorphism so the `--oh-shadow-resting`
// → `--oh-shadow-hover` transition reads as "tap to select." The
// selected chip uses OhCard's `active` prop (elevated `--oh-shadow-
// hover` permanently + no further hover lift) — the same "this is the
// current selection" pattern the workspaces list uses for the active
// workspace.
//
// Storage shape: `User.bookingHorizonDays Int?` — null = unlimited,
// otherwise N rolling calendar days. The form represents Unlimited
// as a chip with `days = null`. Submit sends `{days: number | null}`.
//
// Why preset chips over toggle + number input: presets cover the
// 99% case (most hosts pick a round 1/2/4 week window), no
// keyboard input, no "is the toggle on or off?" ambiguity. Cal.com's
// EventLimitsTab still offers a free-form number on top of the
// toggle, but that surface is power-user; for the visitor-flow setup
// here, six well-chosen presets read as "pick one" not "configure
// a value."

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
  days: z.union([z.literal(null), z.number().int().min(1).max(365)]),
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
                  // Grid splits the container into equal-width
                  // columns so each chip occupies the same horizontal
                  // slot regardless of label length. 2 cols on
                  // mobile — earlier 3-col layout squeezed
                  // "Unlimited" past the chip width (~107px chip on
                  // 400px viewport, label needs ~70px after dot +
                  // padding). 2 cols gives ~165px per chip, every
                  // label fits with breathing room. 6 cols at sm+
                  // where the container has room for one row. Grid
                  // items default to `align-items: stretch` so chip
                  // heights stay uniform.
                  className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6"
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
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() =>
                            field.onChange(preset.days as number | null)
                          }
                          className={cn(
                            // `min-w-0` lets the inner label
                            // `truncate` actually kick in if a future
                            // viewport / locale ever produces a chip
                            // narrower than its label (e.g. a long
                            // translation). Without `min-w-0` on the
                            // flex container, the label's intrinsic
                            // width forces the button to overflow.
                            "oh-focus-ring flex w-full min-w-0 items-center justify-center gap-2 px-4 py-2.5 transition-opacity duration-150 ease-oh",
                            // De-emphasize unselected chips so the
                            // active one reads as the obvious "this is
                            // it" without competing weight from the
                            // other five. Hover lifts them to full
                            // opacity to signal they're tappable.
                            isActive
                              ? "opacity-100"
                              : "opacity-65 hover:opacity-100",
                          )}
                        >
                          {/* Indicator dot. Filled circle when active,
                              hairline ring otherwise — same dot/ring
                              pattern the visitor's status indicator
                              uses on /h/[handle]. Reads at a glance
                              without needing color or copy. */}
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
                              "truncate font-[family-name:var(--font-grotesk)] text-[13px] font-semibold leading-tight tracking-tight tabular-nums",
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
