"use client";

import { useTranslations } from "next-intl";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useSetDurations } from "@/lib/mutations/use-set-durations";
import { DURATION_LIST_MAX_LENGTH } from "@/lib/durations";
import { SectionHeader } from "@/components/oh/section-header";
import { OhDurationPicker } from "@/components/oh/oh-duration-picker";

// Profile durations editor (popup variant, minimal).
//
// Each chip is the trigger of its own popover (single minutes field
// + optional trash icon, auto-commits on close). The "Add duration"
// affordance is a small `+` icon button at the end of the chip
// stack — same popover, no chip yet, the new value lands as a fresh
// chip on close. The icon-only add button keeps the section's
// visual weight on the existing chips, not on the affordance to
// add more.

export function DurationFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();
  const list = me?.durations.list ?? [];
  const defaultMinutes = me?.durations.defaultMinutes ?? 30;

  const setDurations = useSetDurations();

  async function persist(next: number[]) {
    await setDurations.mutateAsync({ minutes: next });
  }

  async function handleEditCommit(original: number, picked: number) {
    if (picked === original) return;
    const next = list.filter((m) => m !== original).concat(picked);
    await persist(next);
  }

  async function handleAddCommit(picked: number) {
    if (list.includes(picked)) return;
    await persist([...list, picked]);
  }

  async function handleRemove(value: number) {
    const next = list.filter((m) => m !== value);
    await persist(next);
  }

  const canAdd = list.length < DURATION_LIST_MAX_LENGTH;

  const pickerLabels = {
    minuteSuffix: t("durationsMinuteSuffix"),
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
                    triggerAriaLabel={t("durationsEditAria", { label: summary })}
                    triggerClassName="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)] data-[popup-open]:shadow-[0_4px_16px_rgba(0,0,0,0.28)]"
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
            Disabled state cues the 8-cap from the schema. */}
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
    <div className="rounded-(--oh-r-sm) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] px-5 py-7 text-left">
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
