"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  buildDayNameOf,
  formatDayLabel,
  validateDraft,
  type DayLabelStrings,
} from "./format-day-label";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { OhTimePicker } from "@/components/oh/oh-time-picker";
import { cn } from "@/lib/utils";
import { DAY_KEYS, defaultSchedule } from "@/lib/schedule";
import type { DayKey, ScheduleValues } from "@/lib/schedule";

export {
  scheduleSchema as availabilitySchema,
  defaultSchedule as defaultAvailability,
} from "@/lib/schedule";
export type { ScheduleValues as AvailabilityValues } from "@/lib/schedule";

const DAY_INDEX: Record<DayKey, number> = Object.fromEntries(
  DAY_KEYS.map((key, index) => [key, index]),
) as Record<DayKey, number>;

const DEFAULT_BLOCK_DRAFT: BlockDraft = {
  days: ["mon", "tue", "wed", "thu", "fri"],
  from: "09:00",
  to: "17:00",
};

type Block = BlockDraft & { id: string };
type BlockDraft = {
  days: DayKey[];
  from: string;
  to: string;
};
type EditorState =
  | { mode: "new"; draft: BlockDraft }
  | { mode: "edit"; originalId: string; draft: BlockDraft };

type FormShape = { availability: ScheduleValues };

export function AvailabilityFields({
  onPersist,
  isPersisting,
}: {
  onPersist: (next: ScheduleValues) => Promise<unknown>;
  isPersisting: boolean;
}) {
  const t = useTranslations("Availability");
  const { setValue } = useFormContext<FormShape>();
  const watchedAvailability = useWatch<FormShape, "availability">({
    name: "availability",
  });
  const schedule = watchedAvailability ?? defaultSchedule;
  const blocks = useMemo(() => deriveBlocks(schedule), [schedule]);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const commit = useCallback(
    (next: Block[]) => {
      setValue("availability", blocksToSchedule(next), {
        shouldDirty: false,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [setValue],
  );

  async function handleSave(draft: BlockDraft) {
    if (!editor) return;
    const withoutEditing =
      editor.mode === "edit"
        ? blocks.filter((b) => b.id !== editor.originalId)
        : blocks;
    const committed: Block[] = [
      ...withoutEditing,
      { id: `block-${Date.now()}`, ...draft },
    ];
    try {
      await onPersist(blocksToSchedule(committed));
      commit(committed);
      setEditor(null);
    } catch {
    }
  }

  async function handleRemove() {
    if (!editor || editor.mode !== "edit") return;
    const next = blocks.filter((b) => b.id !== editor.originalId);
    try {
      await onPersist(blocksToSchedule(next));
      commit(next);
      setEditor(null);
    } catch {
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {blocks.length === 0 ? (
          <EmptyBlocks />
        ) : (
          <ul className="flex flex-col gap-2.5" role="list">
            {blocks.map((block) => (
              <li key={block.id}>
                <BlockChip
                  block={block}
                  onEdit={() =>
                    setEditor({
                      mode: "edit",
                      originalId: block.id,
                      draft: toDraft(block),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="ohGhost"
          size="oh"
          onClick={() =>
            setEditor({ mode: "new", draft: emptyDraft(blocks) })
          }
          className={cn(
            "w-full justify-center border-dotted border-[var(--oh-line-placeholder)] hover:border-transparent",
            "md:w-auto md:self-start md:border-0 md:bg-transparent md:hover:bg-[var(--oh-tint)] md:hover:text-[var(--oh-ink)]",
          )}
        >
          <PlusIcon /> {t("addMoreHours")}
        </Button>
      </div>

      <BlockEditorDrawer
        state={editor}
        otherBlocks={
          editor?.mode === "edit"
            ? blocks.filter((b) => b.id !== editor.originalId)
            : blocks
        }
        onClose={() => setEditor(null)}
        onSave={handleSave}
        onRemove={editor?.mode === "edit" ? handleRemove : undefined}
        isPending={isPersisting}
      />
    </>
  );
}

function EmptyBlocks() {
  const t = useTranslations("Availability");
  return (
    <div className="rounded-(--oh-r-sm) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] px-5 py-7 text-left">
      <p className="oh-eyebrow">{t("noHoursSet")}</p>
      <p className="mt-2 text-[13px] leading-[1.5] opacity-70">
        {t("addBlockHint")}
      </p>
    </div>
  );
}

function BlockChip({
  block,
  onEdit,
}: {
  block: Block;
  onEdit: () => void;
}) {
  const t = useTranslations("Availability");
  const labelStrings = useDayLabelStrings();
  const dayLabel = formatDayLabel(block.days, "short", labelStrings);
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)]"
      aria-label={t("editBlockAria", {
        days: dayLabel,
        time: formatTimeRange(block.from, block.to),
      })}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="oh-eyebrow">{dayLabel}</span>
        <span className="text-[18px] leading-[1.1] font-black tabular-nums">
          {formatTimeRange(block.from, block.to)}
        </span>
      </span>
      <ChevronRightIcon
        className="size-4 shrink-0 opacity-45 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

function BlockEditorDrawer({
  state,
  otherBlocks,
  onClose,
  onSave,
  onRemove,
  isPending,
}: {
  state: EditorState | null;
  otherBlocks: Block[];
  onClose: () => void;
  onSave: (draft: BlockDraft) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  isPending: boolean;
}) {
  return (
    <ResponsiveModal
      open={state !== null}
      onOpenChange={(open) => {
        if (open) return;
        if (isPending) return; // don't close mid-save
        onClose();
      }}
    >
      <ResponsiveModalContent defaultClose={false}>
        {state ? (
          <BlockEditorContent
            key={state.mode === "edit" ? state.originalId : "new"}
            state={state}
            otherBlocks={otherBlocks}
            onClose={onClose}
            onSave={onSave}
            onRemove={onRemove}
            isPending={isPending}
          />
        ) : null}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function BlockEditorContent({
  state,
  otherBlocks,
  onClose,
  onSave,
  onRemove,
  isPending,
}: {
  state: EditorState;
  otherBlocks: Block[];
  onClose: () => void;
  onSave: (draft: BlockDraft) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  isPending: boolean;
}) {
  const t = useTranslations("Availability");
  const labelStrings = useDayLabelStrings();
  const [draft, setDraft] = useState<BlockDraft>(state.draft);
  const [daysOpen, setDaysOpen] = useState(false);
  useEffect(() => {
    setDraft(state.draft);
  }, [state]);

  const errorKey = validateDraft(draft, otherBlocks, labelStrings.nameOf);
  const error =
    errorKey === null
      ? null
      : errorKey === "needsDay"
        ? t("errorNeedsDay")
        : errorKey === "endBeforeStart"
          ? t("errorEndBeforeStart")
          : errorKey.startsWith("overlap:")
            ? t("errorOverlap", { days: errorKey.slice("overlap:".length) })
            : errorKey;
  const canSave = error === null;

  function toggleDay(day: DayKey) {
    setDraft((prev) =>
      prev.days.includes(day)
        ? { ...prev, days: prev.days.filter((d) => d !== day) }
        : { ...prev, days: sortDays([...prev.days, day]) },
    );
  }

  return (
    <>
      <div className="border-b border-[var(--oh-line-firm)] px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <ResponsiveModalTitle className="font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-65">
              {state.mode === "edit" ? t("editHours") : t("newHours")}
            </ResponsiveModalTitle>
            <p className="mt-2 text-[22px] leading-[1.05] font-black uppercase tabular-nums">
              {formatTimeRange(draft.from, draft.to)}
            </p>
            <ResponsiveModalDescription className="sr-only">
              {draft.days.length === 0
                ? t("errorNeedsDay")
                : formatDayLabel(draft.days, "short", labelStrings)}
            </ResponsiveModalDescription>
          </div>
          <ResponsiveModalClose />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          <DaysRowButton
            days={draft.days}
            onOpen={() => setDaysOpen(true)}
          />
          <OhTimePicker
            label={t("from")}
            value={draft.from}
            onChange={(value) => setDraft((prev) => ({ ...prev, from: value }))}
            ariaLabel={t("startTime")}
          />
          <OhTimePicker
            label={t("to")}
            value={draft.to}
            onChange={(value) => setDraft((prev) => ({ ...prev, to: value }))}
            ariaLabel={t("endTime")}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-(--oh-r-xs) bg-[color-mix(in_srgb,var(--oh-ink)_8%,var(--oh-paper))] px-3 py-2.5 font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase shadow-[0_3px_12px_rgba(0,0,0,0.22)]"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="oh-rule h-0" aria-hidden />
      <div className="bg-[color-mix(in_srgb,var(--oh-ink)_4%,var(--oh-paper))] p-4">
        <div
          className={`flex flex-col-reverse gap-3 md:flex-row md:items-center ${
            onRemove ? "md:justify-between" : "md:justify-end"
          }`}
        >
          {onRemove ? (
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              onClick={onRemove}
              disabled={isPending}
              className="w-full justify-center rounded-(--oh-r-xs) md:w-auto"
            >
              <Trash2Icon /> {t("remove")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="oh"
            size="oh"
            onClick={() => onSave(draft)}
            disabled={!canSave || isPending}
            className="w-full justify-center rounded-(--oh-r-xs) md:w-auto"
          >
            <CheckIcon />{" "}
            {isPending
              ? t("savingLabel")
              : state.mode === "edit"
                ? t("save")
                : t("add")}
          </Button>
        </div>
      </div>

      <DayPickerDrawer
        open={daysOpen}
        onClose={() => setDaysOpen(false)}
        days={draft.days}
        toggleDay={toggleDay}
      />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="oh-eyebrow">
      {children}
    </span>
  );
}

function DaysRowButton({
  days,
  onOpen,
}: {
  days: DayKey[];
  onOpen: () => void;
}) {
  const t = useTranslations("Availability");
  const labelStrings = useDayLabelStrings();
  const label =
    days.length === 0
      ? t("pickDays")
      : formatDayLabel(days, "long", labelStrings);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)]"
      aria-label={t("editDaysAria", { label })}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="oh-eyebrow">
          {t("days")}
        </span>
        <span className="truncate text-[18px] leading-[1.1] font-black">
          {label}
        </span>
      </span>
      <ChevronRightIcon
        className="size-4 shrink-0 opacity-45 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

function DayToggle({
  label,
  longLabel,
  selected,
  onClick,
}: {
  label: string;
  longLabel: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={longLabel}
      className={`relative flex w-full items-center justify-between gap-3 rounded-(--oh-r-xs) px-4 py-3 text-left font-[family-name:var(--oh-mono)] text-[12px] font-black tracking-[1.5px] uppercase transition-[box-shadow,background-color,color,opacity] duration-150 ease-oh focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)] shadow-[0_3px_12px_rgba(0,0,0,0.22)] ${
        selected
          ? "bg-oh-ink text-oh-paper"
          : "bg-oh-paper text-oh-ink opacity-65 hover:opacity-100 hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-(--oh-r-xs) transition-[background-color,box-shadow] duration-150 ease-oh ${
          selected
            ? "bg-oh-paper text-oh-ink shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
            : "bg-[color:var(--oh-paper)]/30 text-transparent shadow-[inset_0_0_3px_rgba(0,0,0,0.18)]"
        }`}
        aria-hidden
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

function DayPickerDrawer({
  open,
  onClose,
  days,
  toggleDay,
}: {
  open: boolean;
  onClose: () => void;
  days: DayKey[];
  toggleDay: (day: DayKey) => void;
}) {
  const t = useTranslations("Availability");
  const labelStrings = useDayLabelStrings();
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      nested
    >
      <ResponsiveModalContent
        mobileClassName="oh-drawer-content-nested"
        defaultClose={false}
      >
        <div className="border-b border-[var(--oh-line-firm)] px-5 pt-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <ResponsiveModalTitle className="font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-65">
                {t("days")}
              </ResponsiveModalTitle>
              <p className="mt-2 text-[22px] leading-[1.05] font-black uppercase">
                {days.length === 0
                  ? t("none")
                  : formatDayLabel(days, "long", labelStrings)}
              </p>
            </div>
            <ResponsiveModalClose />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-1.5">
            {DAY_KEYS.map((key) => {
              const long = labelStrings.nameOf(key, "long");
              return (
                <DayToggle
                  key={key}
                  label={long}
                  longLabel={long}
                  selected={days.includes(key)}
                  onClick={() => toggleDay(key)}
                />
              );
            })}
          </div>
        </div>
        <div className="border-t border-[var(--oh-line-firm)] bg-[color-mix(in_srgb,var(--oh-ink)_4%,var(--oh-paper))] p-4">
          <Button
            type="button"
            variant="oh"
            size="oh"
            onClick={onClose}
            className="w-full justify-center rounded-(--oh-r-xs)"
          >
            <CheckIcon /> {t("done")}
          </Button>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function toDraft(block: Block): BlockDraft {
  return { days: [...block.days], from: block.from, to: block.to };
}

function emptyDraft(existing: Block[]): BlockDraft {
  if (existing.length === 0) return { ...DEFAULT_BLOCK_DRAFT };
  return { days: [], from: "09:00", to: "17:00" };
}

function sortDays(days: DayKey[]): DayKey[] {
  return [...new Set(days)].sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);
}

function deriveBlocks(schedule: ScheduleValues): Block[] {
  const map = new Map<string, DayKey[]>();
  for (const key of DAY_KEYS) {
    const day = schedule[key];
    if (!day.enabled) continue;
    for (const range of day.ranges) {
      const signature = `${range.from}|${range.to}`;
      const list = map.get(signature) ?? [];
      list.push(key);
      map.set(signature, list);
    }
  }
  return Array.from(map.entries())
    .map(([signature, days]) => {
      const [from, to] = signature.split("|");
      return { id: `b-${signature}`, days: sortDays(days), from, to };
    })
    .sort((a, b) => {
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      return DAY_INDEX[a.days[0]] - DAY_INDEX[b.days[0]];
    });
}

function blocksToSchedule(blocks: Block[]): ScheduleValues {
  const next: ScheduleValues = {
    mon: { enabled: false, ranges: [] },
    tue: { enabled: false, ranges: [] },
    wed: { enabled: false, ranges: [] },
    thu: { enabled: false, ranges: [] },
    fri: { enabled: false, ranges: [] },
    sat: { enabled: false, ranges: [] },
    sun: { enabled: false, ranges: [] },
  };
  for (const block of blocks) {
    for (const day of block.days) {
      next[day].enabled = true;
      next[day].ranges.push({ from: block.from, to: block.to });
    }
  }
  for (const key of DAY_KEYS) {
    next[key].ranges.sort((a, b) => a.from.localeCompare(b.from));
  }
  return next;
}

function useDayLabelStrings(): DayLabelStrings {
  const format = useFormatter();
  const t = useTranslations("Availability");
  return useMemo(
    () => ({
      nameOf: buildDayNameOf(format),
      empty: t("noDays"),
      everyDay: t("everyDay"),
    }),
    [format, t],
  );
}

function formatTimeRange(from: string, to: string): string {
  return `${formatTime(from)} – ${formatTime(to)}`;
}

function formatTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
