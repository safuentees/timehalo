"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/hooks";
import { useSetDurations } from "@/lib/mutations/use-set-durations";
import { DURATION_LIST_MAX_LENGTH } from "@/lib/durations";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/oh/section-header";
import { OhDurationPicker } from "@/components/oh/oh-duration-picker";

const FALLBACK_DEFAULT_MINUTES = 30;

export function DurationFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();
  const list = me?.durations.list ?? [];
  const defaultMinutes =
    me?.durations.defaultMinutes ?? FALLBACK_DEFAULT_MINUTES;

  const setDurations = useSetDurations();

  async function persist(next: number[]) {
    await setDurations.mutateAsync({ minutes: next });
  }

  async function handleEditCommit(original: number, picked: number) {
    if (picked === original) return; // no-op
    const next = list.filter((m) => m !== original).concat(picked);
    await persist(next);
  }

  async function handleAddCommit(picked: number) {
    if (list.includes(picked)) return; // duplicate guard already in popover
    await persist([...list, picked]);
  }

  async function handleRemove(value: number) {
    const next = list.filter((m) => m !== value);
    await persist(next);
  }

  const canAdd = list.length < DURATION_LIST_MAX_LENGTH;

  const pickerLabels = {
    hourLabel: t("durationsHourLabel"),
    minuteLabel: t("durationsMinuteLabel"),
    addAction: t("durationsAdd"),
    saveAction: t("durationsSave"),
    removeAction: t("durationsRemove"),
    rangeError: t("durationsRangeError"),
    duplicateError: t("durationsDuplicateError"),
  };

  return (
    <section aria-labelledby="durations-legend">
      <SectionHeader
        legendId="durations-legend"
        legend={t("durationsLegend")}
        description={t("durationsDescription")}
      />
      <div className="mt-5 flex flex-col gap-3">
        {list.length === 0 ? (
          <EmptyDurations />
        ) : (
          <ul className="flex flex-col gap-2.5" role="list">
            {list.map((minutes) => (
              <li key={minutes}>
                <OhDurationPicker
                  mode="edit"
                  initialMinutes={minutes}
                  onCommit={(picked) => handleEditCommit(minutes, picked)}
                  onRemove={() => handleRemove(minutes)}
                  isPending={setDurations.isPending}
                  existingMinutes={list.filter((m) => m !== minutes)}
                  labels={pickerLabels}
                >
                  <DurationChipTrigger
                    minutes={minutes}
                    isDefault={minutes === defaultMinutes}
                  />
                </OhDurationPicker>
              </li>
            ))}
          </ul>
        )}

        <OhDurationPicker
          mode="add"
          onCommit={handleAddCommit}
          isPending={setDurations.isPending}
          existingMinutes={list}
          labels={pickerLabels}
          disabled={!canAdd}
        >
          <AddDurationTrigger
            label={t("durationsAddLabel")}
            disabled={!canAdd}
          />
        </OhDurationPicker>
      </div>
    </section>
  );
}

function EmptyDurations() {
  const t = useTranslations("Profile");
  return (
    <div className="rounded-(--oh-r-sm) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] px-5 py-7 text-left">
      <p className="oh-eyebrow">{t("durationsEmpty")}</p>
      <p className="oh-description mt-2">{t("durationsEmptyHint")}</p>
    </div>
  );
}

const DurationChipTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    minutes: number;
    isDefault: boolean;
  }
>(function DurationChipTrigger(
  { minutes, isDefault, className, ...rest },
  ref,
) {
  const t = useTranslations("Profile");
  const summary = formatDurationSummary(minutes, t);
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      aria-label={t("durationsEditAria", { label: summary })}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)] data-[popup-open]:shadow-[0_4px_16px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="oh-eyebrow">
          {isDefault ? t("durationsValueLabel") : t("durationsValueLegend")}
        </span>
        <span className="text-[18px] leading-[1.1] font-black tabular-nums">
          {summary}
        </span>
      </span>
      <ChevronRightIcon
        className="size-4 shrink-0 opacity-45 transition-[opacity,transform] duration-150 ease-oh group-hover:opacity-100 group-data-[popup-open]:rotate-90 group-data-[popup-open]:opacity-100"
        aria-hidden
      />
    </button>
  );
});

const AddDurationTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    label: string;
    disabled?: boolean;
  }
>(function AddDurationTrigger(
  { label, disabled, className, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ohGhost"
      size="oh"
      disabled={disabled}
      {...rest}
      className={cn(
        "w-full justify-center border-dotted border-[var(--oh-line-placeholder)] hover:border-transparent",
        "md:w-auto md:self-start md:border-0 md:bg-transparent md:hover:bg-[var(--oh-tint)] md:hover:text-[var(--oh-ink)]",
        className,
      )}
    >
      <PlusIcon /> {label}
    </Button>
  );
});

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
