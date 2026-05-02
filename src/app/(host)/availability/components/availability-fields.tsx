"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { OhTimePicker } from "@/components/oh/oh-time-picker";
import { cn } from "@/lib/utils";
import { DAY_KEYS, defaultSchedule } from "@/lib/schedule";
import type { DayKey, ScheduleValues } from "@/lib/schedule";

// Re-exports keep `availability-form` reading the schedule schema from
// the same module that owns the field UI — no extra hop through `lib/`.
export {
  scheduleSchema as availabilitySchema,
  defaultSchedule as defaultAvailability,
} from "@/lib/schedule";
export type { ScheduleValues as AvailabilityValues } from "@/lib/schedule";

/**
 * Availability surface — a list of "hour blocks". Each block pairs a
 * set of days with a single time range (e.g. Mon–Fri 9–5, Sat 10–2).
 * Tapping a chip opens a bottom-sheet editor with day toggle chips and
 * from/to inputs. Overlapping ranges on a shared day are refused at the
 * editor level so persisted schedules stay clean.
 */

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
          variant="ohGhost"
          size="oh"
          onClick={() =>
            setEditor({ mode: "new", draft: emptyDraft(blocks) })
          }
          className={cn(
            // Mobile: full-width dotted CTA — clear "tap to add" target
            // at the bottom of the list, sized for thumb reach. Soft
            // placeholder border (--oh-line-placeholder, ~12% ink)
            // overrides the ohGhost variant's 100% ink border so the
            // dots fade into the page bg. On hover the variant fills
            // with ink — drop the dots to transparent so they don't
            // halo the inverted button (border-style can't transition
            // smoothly, but border-color can).
            "w-full justify-center border-dotted border-[var(--oh-line-placeholder)] hover:border-transparent",
            // Desktop: content-sized text affordance, left-aligned. No
            // border, no resting bg — gets out of the list's way and
            // doesn't compete with the visually weighted block chips
            // above. Subtle tint hover replaces the variant's full ink
            // invert (which would over-emphasise it on a 760px row).
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
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) border-[1.5px] border-[var(--oh-line-firm)] bg-[var(--oh-paper)] px-5 py-4 text-left transition-colors duration-150 ease-oh hover:border-[var(--oh-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)]"
      aria-label={t("editBlockAria", {
        days: formatDayLabel(block.days),
        time: formatTimeRange(block.from, block.to),
      })}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="oh-eyebrow">{formatDayLabel(block.days)}</span>
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
      <ResponsiveModalContent defaultClose={false}>
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
  // B.PT26 — chrome strings localized via the Availability namespace.
  // Day-name range-compression logic in `formatDayLabel` is still
  // English-only; that ports over in B.PT26B (separate row, requires
  // refactoring the pure helper to accept locale-aware day names).
  const t = useTranslations("Availability");
  const [draft, setDraft] = useState<BlockDraft>(state.draft);
  const [daysOpen, setDaysOpen] = useState(false);
  // Reset if the drawer is reused for a different block before unmount.
  useEffect(() => {
    setDraft(state.draft);
  }, [state]);

  // Map error keys returned by `validateDraft` to localized strings
  // here so the helper itself stays a pure (locale-agnostic) function.
  // The helper returns null | "needsDay" | "endBeforeStart" | overlap
  // text starting with `overlap:`. Overlap text carries the day list
  // verbatim — that's the part B.PT26B will localize.
  const errorKey = validateDraft(draft, otherBlocks);
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
            className="mt-5 rounded-(--oh-r-xs) border-[1.5px] border-[var(--oh-ink)] bg-[color-mix(in_srgb,var(--oh-ink)_8%,var(--oh-paper))] px-3 py-2.5 font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="border-t border-[var(--oh-line-firm)] bg-[color-mix(in_srgb,var(--oh-ink)_4%,var(--oh-paper))] p-4">
        {/*
          Footer follows the canonical dialog pattern (Apple HIG / shadcn
          DialogFooter / Linear / Vercel):
          • Mobile (drawer): stack column-reverse so the primary action
            sits on top of the destructive one, full-width tap targets.
          • Desktop (modal): row, content-sized buttons. Destructive
            (Remove) far-left, primary (Save) far-right with the gap
            between them — separates the destructive action from the
            primary so it can't be tapped by accident.
          When there's no Remove (new-block mode), Save right-aligns
          alone via `md:justify-end`.
        */}
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
            disabled={!canSave}
            className="w-full justify-center rounded-(--oh-r-xs) md:w-auto"
          >
            <CheckIcon /> {state.mode === "edit" ? t("save") : t("add")}
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
  const label =
    days.length === 0 ? t("pickDays") : formatDayLabel(days, "long");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) border-[1.5px] border-[var(--oh-line-firm)] bg-[var(--oh-paper)] px-5 py-4 text-left transition-colors duration-150 ease-oh hover:border-[var(--oh-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)]"
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
      className={`relative flex w-full items-center justify-between gap-3 rounded-(--oh-r-xs) border-[1.5px] border-[var(--oh-ink)] px-4 py-3 text-left font-[family-name:var(--oh-mono)] text-[12px] font-black tracking-[1.5px] uppercase transition-colors duration-150 ease-oh focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)] ${
        selected
          ? "bg-oh-ink text-oh-paper"
          : "bg-oh-paper text-oh-ink opacity-65 hover:opacity-100"
      }`}
    >
      <span>{label}</span>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-(--oh-r-xs) border-[1.5px] ${
          selected
            ? "border-oh-paper bg-oh-paper text-oh-ink"
            : "border-oh-ink bg-transparent text-transparent"
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
                {days.length === 0 ? t("none") : formatDayLabel(days, "long")}
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

// ——— Helpers ———

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

// B.PT26 — returns a sentinel KEY (`needsDay` / `endBeforeStart` /
// `overlap:<comma-list>`) instead of a localized string. Caller maps
// to a translated message via `useTranslations("Availability")`.
// Keeping the helper pure means the validation logic stays tested
// independently of locale rendering. Day-name parts of the overlap
// list are still English here — B.PT26B refactors them.
function validateDraft(draft: BlockDraft, others: Block[]): string | null {
  if (draft.days.length === 0) return "needsDay";
  if (draft.from >= draft.to) return "endBeforeStart";
  for (const other of others) {
    const shared = draft.days.filter((d) => other.days.includes(d));
    if (shared.length === 0) continue;
    if (draft.from < other.to && other.from < draft.to) {
      return `overlap:${shared
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

  // Range-compression / "summary ranges" algorithm. Walk the sorted
  // day indices, open a run at each value, close it when the next
  // index breaks contiguity. Each closed run emits a single name (if
  // length 1) or "start – end" (if length 2+). Joined with ", " gives:
  //   [mon, tue, wed]            -> "Mon – Wed"
  //   [mon, tue, wed, fri, sat]  -> "Mon – Wed, Fri – Sat"
  //   [mon, wed, fri]            -> "Mon, Wed, Fri"
  const sorted = sortDays(days);
  const indices = sorted.map((d) => DAY_INDEX[d]);
  const runs: Array<[number, number]> = [];
  let start = indices[0];
  let prev = start;
  for (let i = 1; i < indices.length; i++) {
    const curr = indices[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      runs.push([start, prev]);
      start = curr;
      prev = curr;
    }
  }
  runs.push([start, prev]);

  return runs
    .map(([s, e]) =>
      s === e
        ? name(sorted[indices.indexOf(s)])
        : `${name(sorted[indices.indexOf(s)])} – ${name(sorted[indices.indexOf(e)])}`,
    )
    .join(", ");
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
