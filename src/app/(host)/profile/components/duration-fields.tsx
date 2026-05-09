"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useSetDurations } from "@/lib/mutations/use-set-durations";
import {
  DURATION_LIST_MAX_LENGTH,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from "@/lib/durations";
import { SectionHeader } from "@/components/oh/section-header";
import { OhDurationPicker } from "@/components/oh/oh-duration-picker";
import { InlineFormSave } from "@/components/oh/inline-form-save";

// Profile durations editor (popup variant, dirty-save shape).
//
// Each chip is the trigger of its own popover (single minutes field
// + save Check + trash icon for remove). The "Add duration"
// affordance is a small `+` icon button at the end of the chip
// stack — same popover, no chip yet, the new value lands as a fresh
// chip on close.
//
// Save semantics — matches the handle/bio sections above. Picker
// commits update LOCAL form state via `setValue(... shouldDirty: true)`;
// the section's <InlineFormSave> appears when the form is dirty and
// commits the whole list via `users.setDurationsList`. No more
// auto-save per chip change. (Previous implementation called the
// mutation immediately from each picker handler — confusing because
// changes hit the server invisibly + couldn't be batched / undone.)
//
// Two-+-button cleanup: the inside-popover save button switched
// from a Plus icon to a Check icon (in oh-duration-picker.tsx).
// The outside trigger keeps Plus — universal "add" affordance.
// Inside Check = "confirm this value." Different icons, different
// semantics, no more visual redundancy.
//
// Future-proof shape: form value is `number[]` today, but the
// handlers below operate on `next: number[]` arrays so a later
// migration to `Array<{ minutes: number; description?: string;
// title?: string }>` is mostly a schema + type swap. The picker's
// API (`initialMinutes` → `onCommit(minutes)`) becomes
// (`initialItem` → `onCommit(item)`) at that point — no surrounding
// section logic needs to change.

const formSchema = z.object({
  minutes: z
    .array(
      z
        .number()
        .int()
        .min(DURATION_MIN_MINUTES)
        .max(DURATION_MAX_MINUTES),
    )
    .max(DURATION_LIST_MAX_LENGTH),
});
type FormValues = z.infer<typeof formSchema>;

export function DurationFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({ minutes: me?.durations.list ?? [] }),
    [me],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onChange",
  });

  const setDurations = useSetDurations();

  async function onSubmit(v: FormValues) {
    await setDurations.mutateAsync({ minutes: v.minutes });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DurationFieldsBody />
        <InlineFormSave
          isPending={setDurations.isPending}
          isDirty={form.formState.isDirty}
          isInvalid={!form.formState.isValid}
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

// Inner body — separate component so it can read the form value via
// `useWatch` without re-rendering the outer Save button on every
// chip edit.
function DurationFieldsBody() {
  const t = useTranslations("Profile");
  const { setValue } = useFormContext<FormValues>();
  // useWatch's typing returns the union of all watched field types
  // when given just a name. Two-generic form narrows to the exact
  // field type (`number[]` here).
  const list =
    useWatch<FormValues, "minutes">({ name: "minutes" }) ?? [];
  const { data: me } = trpc.users.me.useQuery();
  const defaultMinutes = me?.durations.defaultMinutes ?? 30;

  function commit(next: number[]) {
    // Sort ascending so "30 → 60 → 90 → 120" reads as a duration
    // ladder regardless of insertion order. shouldDirty fires the
    // form's dirty flag → InlineFormSave appears.
    const sorted = [...next].sort((a, b) => a - b);
    setValue("minutes", sorted, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function handleEditCommit(original: number, picked: number) {
    if (picked === original) return;
    commit(list.filter((m) => m !== original).concat(picked));
  }

  function handleAddCommit(picked: number) {
    if (list.includes(picked)) return;
    commit([...list, picked]);
  }

  function handleRemove(value: number) {
    commit(list.filter((m) => m !== value));
  }

  const canAdd = list.length < DURATION_LIST_MAX_LENGTH;

  const pickerLabels = {
    minuteSuffix: t("durationsMinuteSuffix"),
    saveAria: t("durationsSave"),
    removeAria: t("durationsRemove"),
  };

  return (
    <section aria-labelledby="durations-legend">
      <SectionHeader
        legendId="durations-legend"
        legend={t("durationsLegend")}
        description={t("durationsDescription")}
      />
      <div className="mt-5 flex flex-col gap-3">
        {list.length === 0 ? <EmptyDurations /> : null}

        {list.length > 0 ? (
          <ul className="flex flex-col gap-2.5" role="list">
            {list.map((minutes) => {
              const summary = formatDurationSummary(minutes, t);
              const isDefault = minutes === defaultMinutes;
              return (
                <li key={minutes}>
                  <OhDurationPicker
                    mode="edit"
                    initialMinutes={minutes}
                    onCommit={(picked) => handleEditCommit(minutes, picked)}
                    onRemove={() => handleRemove(minutes)}
                    existingMinutes={list.filter((m) => m !== minutes)}
                    labels={pickerLabels}
                    triggerAriaLabel={t("durationsEditAria", {
                      label: summary,
                    })}
                    triggerClassName="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[var(--oh-shadow-resting)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)] data-[popup-open]:shadow-[var(--oh-shadow-hover)]"
                    triggerContent={
                      <>
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="oh-eyebrow">
                            {isDefault
                              ? t("durationsValueLabel")
                              : t("durationsValueLegend")}
                          </span>
                          <span className="text-[18px] leading-[1.1] font-black tabular-nums">
                            {summary}
                          </span>
                          {/* Future per-chip metadata renders here.
                              When `description` / `title` join the
                              chip schema, render them as additional
                              sibling spans inside this column —
                              picker reads/writes the same shape. */}
                        </span>
                        <ChevronRightIcon
                          className="size-4 shrink-0 opacity-45 transition-[opacity,transform] duration-150 ease-oh group-hover:opacity-100 group-data-[popup-open]:rotate-90 group-data-[popup-open]:opacity-100"
                          aria-hidden
                        />
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* Icon-only add trigger. Sits below the chip stack as a
            small ghost button — keeps the section's visual weight
            on the existing chips while still surfacing the affordance.
            Disabled state cues the 8-cap from the schema. The save
            action inside the popover uses a Check icon so this `+`
            and the in-popover button don't read as redundant. */}
        <OhDurationPicker
          mode="add"
          onCommit={handleAddCommit}
          existingMinutes={list}
          labels={pickerLabels}
          disabled={!canAdd}
          triggerAriaLabel={t("durationsAddLabel")}
          triggerClassName="oh-focus-ring inline-flex size-9 items-center justify-center self-start rounded-(--oh-r-sm) text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-[color:var(--oh-content-muted)] data-[popup-open]:bg-[var(--oh-tint)] data-[popup-open]:text-[var(--oh-ink)]"
          triggerContent={<PlusIcon className="size-4" strokeWidth={1.75} />}
        />
      </div>
    </section>
  );
}

function EmptyDurations() {
  const t = useTranslations("Profile");
  return (
    <div className="oh-empty-surface rounded-(--oh-r-sm) px-5 py-7 text-left">
      <p className="oh-eyebrow">{t("durationsEmpty")}</p>
      <p className="oh-description mt-2">{t("durationsEmptyHint")}</p>
    </div>
  );
}

// "75" → "1 hr 15 min", "60" → "1 hr", "30" → "30 min".
function formatDurationSummary(
  minutes: number,
  t: ReturnType<typeof useTranslations<"Profile">>,
): string {
  if (minutes < 60) return t("durationsValueSummary", { minutes });
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return t("durationsValueSummaryHours", { hours });
  return t("durationsValueSummaryHoursMinutes", { hours, minutes: rem });
}
