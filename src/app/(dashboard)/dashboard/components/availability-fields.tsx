"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { DAY_KEYS, defaultSchedule } from "@/lib/schedule";
import type { DayKey, ScheduleValues } from "@/lib/schedule";

export {
  scheduleSchema as availabilitySchema,
  defaultSchedule as defaultAvailability,
} from "@/lib/schedule";
export type { ScheduleValues as AvailabilityValues } from "@/lib/schedule";

const DAYS: ReadonlyArray<{ key: DayKey; short: string; long: string }> = [
  { key: "mon", short: "Mon", long: "Monday" },
  { key: "tue", short: "Tue", long: "Tuesday" },
  { key: "wed", short: "Wed", long: "Wednesday" },
  { key: "thu", short: "Thu", long: "Thursday" },
  { key: "fri", short: "Fri", long: "Friday" },
  { key: "sat", short: "Sat", long: "Saturday" },
  { key: "sun", short: "Sun", long: "Sunday" },
] as const;

const WEEKDAYS: ReadonlySet<DayKey> = new Set(["mon", "tue", "wed", "thu", "fri"]);
const WEEKENDS: ReadonlySet<DayKey> = new Set(["sat", "sun"]);
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

export function AvailabilityFields() {
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
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    [setValue],
  );

  function handleSave(draft: BlockDraft) {
    if (!editor) return;
    const withoutEditing =
      editor.mode === "edit"
        ? blocks.filter((b) => b.id !== editor.originalId)
        : blocks;
    const committed: Block[] = [
      ...withoutEditing,
      { id: `block-${Date.now()}`, ...draft },
    ];
    commit(committed);
    setEditor(null);
  }

  function handleRemove() {
    if (!editor || editor.mode !== "edit") return;
    commit(blocks.filter((b) => b.id !== editor.originalId));
    setEditor(null);
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
          variant="brutalistGhost"
          size="brutalist"
          onClick={() =>
            setEditor({ mode: "new", draft: emptyDraft(blocks) })
          }
          className="w-full justify-center border-dashed"
        >
          <PlusIcon /> Add more hours
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
      />
    </>
  );
}

function EmptyBlocks() {
  return (
    <div className="rounded-(--bru-r-sm) border-[1.5px] border-dashed border-[var(--bru-line-dashed)] px-5 py-7 text-left">
      <p className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
        No hours set
      </p>
      <p className="mt-2 text-[13px] leading-[1.5] opacity-70">
        Add a block to tell visitors when they can book you.
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
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group relative flex w-full flex-col gap-1.5 rounded-(--bru-r-sm) border-[1.5px] border-[var(--bru-line-firm)] bg-[var(--bru-paper)] px-5 py-4 text-left transition-colors duration-150 ease-bru hover:border-[var(--bru-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bru-ink)]"
      aria-label={`Edit ${formatDayLabel(block.days)}, ${formatTimeRange(block.from, block.to)}`}
    >
      <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
        {formatDayLabel(block.days)}
      </span>
      <span className="text-[18px] leading-[1.1] font-black tabular-nums">
        {formatTimeRange(block.from, block.to)}
      </span>
    </button>
  );
}

function BlockEditorDrawer({
  state,
  otherBlocks,
  onClose,
  onSave,
  onRemove,
}: {
  state: EditorState | null;
  otherBlocks: Block[];
  onClose: () => void;
  onSave: (draft: BlockDraft) => void;
  onRemove?: () => void;
}) {
  return (
    <ResponsiveModal
      open={state !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <ResponsiveModalContent>
        {state ? (
          <BlockEditorContent
            key={state.mode === "edit" ? state.originalId : "new"}
            state={state}
            otherBlocks={otherBlocks}
            onClose={onClose}
            onSave={onSave}
            onRemove={onRemove}
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
}: {
  state: EditorState;
  otherBlocks: Block[];
  onClose: () => void;
  onSave: (draft: BlockDraft) => void;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useState<BlockDraft>(state.draft);
  const [daysOpen, setDaysOpen] = useState(false);
  useEffect(() => {
    setDraft(state.draft);
  }, [state]);

  const error = validateDraft(draft, otherBlocks);
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
      <div className="border-b border-[var(--bru-line-firm)] px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <ResponsiveModalTitle className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-65">
              {state.mode === "edit" ? "Edit hours" : "New hours"}
            </ResponsiveModalTitle>
            <p className="mt-2 text-[22px] leading-[1.05] font-black uppercase tabular-nums">
              {formatTimeRange(draft.from, draft.to)}
            </p>
            <ResponsiveModalDescription className="sr-only">
              {draft.days.length === 0
                ? "Pick at least one day"
                : formatDayLabel(draft.days)}
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
          <TimeColumn
            label="From"
            value={draft.from}
            onChange={(value) => setDraft((prev) => ({ ...prev, from: value }))}
            ariaLabel="Start time"
          />
          <TimeColumn
            label="To"
            value={draft.to}
            onChange={(value) => setDraft((prev) => ({ ...prev, to: value }))}
            ariaLabel="End time"
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-(--bru-r-xs) border-[1.5px] border-[var(--bru-ink)] bg-[color-mix(in_srgb,var(--bru-ink)_8%,var(--bru-paper))] px-3 py-2.5 font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="border-t border-[var(--bru-line-firm)] bg-[color-mix(in_srgb,var(--bru-ink)_4%,var(--bru-paper))] p-4">
        <div className={`grid gap-2.5 ${onRemove ? "grid-cols-[1fr_1.4fr]" : "grid-cols-1"}`}>
          {onRemove ? (
            <Button
              type="button"
              variant="brutalistGhost"
              size="brutalist"
              onClick={onRemove}
              className="w-full justify-center rounded-(--bru-r-xs)"
            >
              <Trash2Icon /> Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant="brutalist"
            size="brutalist"
            onClick={() => onSave(draft)}
            disabled={!canSave}
            className="w-full justify-center rounded-(--bru-r-xs)"
          >
            <CheckIcon /> {state.mode === "edit" ? "Save" : "Add"}
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
    <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
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
  const label =
    days.length === 0 ? "Pick days" : formatDayLabel(days, "long");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 rounded-(--bru-r-sm) border-[1.5px] border-[var(--bru-line-firm)] bg-[var(--bru-paper)] px-5 py-4 text-left transition-colors duration-150 ease-bru hover:border-[var(--bru-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bru-ink)]"
      aria-label={`Edit days: ${label}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
          Days
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
      className={`relative flex w-full items-center justify-between gap-3 rounded-(--bru-r-xs) border-[1.5px] border-[var(--bru-ink)] px-4 py-3 text-left font-[family-name:var(--bru-mono)] text-[12px] font-black tracking-[1.5px] uppercase transition-colors duration-150 ease-bru focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bru-ink)] ${
        selected
          ? "bg-[var(--bru-ink)] text-[var(--bru-paper)]"
          : "bg-[var(--bru-paper)] text-[var(--bru-ink)] opacity-65 hover:opacity-100"
      }`}
    >
      <span>{label}</span>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-(--bru-r-xs) border-[1.5px] ${
          selected
            ? "border-[var(--bru-paper)] bg-[var(--bru-paper)] text-[var(--bru-ink)]"
            : "border-[var(--bru-ink)] bg-transparent text-transparent"
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
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      nested
    >
      <ResponsiveModalContent mobileClassName="bru-drawer-content-nested">
        <div className="border-b border-[var(--bru-line-firm)] px-5 pt-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <ResponsiveModalTitle className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-65">
                Days
              </ResponsiveModalTitle>
              <p className="mt-2 text-[22px] leading-[1.05] font-black uppercase">
                {days.length === 0 ? "None" : formatDayLabel(days, "long")}
              </p>
            </div>
            <ResponsiveModalClose />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-1.5">
            {DAYS.map((day) => (
              <DayToggle
                key={day.key}
                label={day.long}
                longLabel={day.long}
                selected={days.includes(day.key)}
                onClick={() => toggleDay(day.key)}
              />
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--bru-line-firm)] bg-[color-mix(in_srgb,var(--bru-ink)_4%,var(--bru-paper))] p-4">
          <Button
            type="button"
            variant="brutalist"
            size="brutalist"
            onClick={onClose}
            className="w-full justify-center rounded-(--bru-r-xs)"
          >
            <CheckIcon /> Done
          </Button>
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function TimeColumn({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <label className="group relative flex w-full items-center gap-3 rounded-(--bru-r-sm) border-[1.5px] border-[var(--bru-line-firm)] bg-[var(--bru-paper)] px-5 py-4 text-left transition-colors duration-150 ease-bru hover:border-[var(--bru-ink)] has-[:focus-visible]:border-[var(--bru-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--bru-ink)]">
      <input
        type="time"
        step={900}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 size-full cursor-pointer appearance-none bg-transparent opacity-0 focus:outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
      />
      <span className="pointer-events-none flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
          {label}
        </span>
        <span className="truncate text-[18px] leading-[1.1] font-black tabular-nums">
          {formatTime(value)}
        </span>
      </span>
      <ChevronRightIcon
        className="pointer-events-none size-4 shrink-0 opacity-45 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </label>
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

function validateDraft(draft: BlockDraft, others: Block[]): string | null {
  if (draft.days.length === 0) return "Pick at least one day";
  if (draft.from >= draft.to) return "End must be after start";
  for (const other of others) {
    const shared = draft.days.filter((d) => other.days.includes(d));
    if (shared.length === 0) continue;
    if (draft.from < other.to && other.from < draft.to) {
      return `Overlaps on ${shared
        .map((d) => DAYS.find((x) => x.key === d)?.short ?? d)
        .join(", ")}`;
    }
  }
  return null;
}

function formatDayLabel(days: DayKey[], length: "short" | "long" = "short"): string {
  if (days.length === 0) return "No days";
  const name = (key: DayKey) => {
    const meta = DAYS.find((d) => d.key === key);
    if (!meta) return key;
    return length === "long" ? meta.long : meta.short;
  };
  if (days.length === 7) return "Every day";
  if (
    days.length === 5 &&
    days.every((d) => WEEKDAYS.has(d)) &&
    WEEKDAYS.size === days.length
  )
    return `${name("mon")} – ${name("fri")}`;
  if (
    days.length === 2 &&
    days.every((d) => WEEKENDS.has(d)) &&
    WEEKENDS.size === days.length
  )
    return `${name("sat")} – ${name("sun")}`;

  const sorted = sortDays(days);
  const indices = sorted.map((d) => DAY_INDEX[d]);
  const contiguous = indices.every(
    (value, i) => i === 0 || value === indices[i - 1] + 1,
  );
  if (contiguous && sorted.length > 1) {
    return `${name(sorted[0])} – ${name(sorted[sorted.length - 1])}`;
  }
  return sorted.map(name).join(", ");
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
