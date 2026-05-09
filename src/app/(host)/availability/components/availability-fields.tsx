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

// B.PT26B — `DAYS` array dropped. Day names resolve via the
// localized `dayLabelStrings.nameOf` (built from `useFormatter` in
// each consumer) and feed `formatDayLabel` / `validateDraft` which
// live in `./format-day-label.ts`. The DAY_KEYS canonical order is
// imported from `@/lib/schedule`. Local-only `DAY_INDEX` survives
// because `deriveBlocks` + `sortDays` use it to keep the persisted
// `ScheduleValues` shape ordered (mon → sun) regardless of the
// order chips were toggled.
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
  /**
   * B.PT300 — drawer save persists directly to the server. Returns
   * a Promise so the drawer can await it (close on success, stay
   * open on error). Form local state is updated AFTER the server
   * confirms — keeps UI in sync with persisted truth, no revert
   * needed on failure.
   */
  onPersist: (next: ScheduleValues) => Promise<unknown>;
  /** True while the mutation is in flight. Threads through to the
   *  drawer's Save button so it shows "Saving…" + disables. */
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

  // B.PT300 — drawer "Save" / "Remove" now persist atomically:
  //   1. Compute the next blocks list
  //   2. Await the server mutation (await catches errors)
  //   3. On success: update form local state + close drawer
  //   4. On error: hook's onError already toasted — we keep the
  //      drawer open so the user can retry or cancel
  // The `await` keeps the drawer's Save button in `isPending` state
  // throughout (visual feedback) without a manual loading state of
  // our own.
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
      // Mutation hook already shows error toast; drawer stays open.
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
      // Same as handleSave — keep drawer open on error.
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
      <p className="oh-description mt-2">
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
      // B.PT295 — borderless drawer-trigger chip with the canonical
      // app drop shadow (`0 3px 12px rgba(0,0,0,0.22)`, same as the
      // `oh` button variant). Hover lift mirrors the button hover
      // pattern (`0 4px 16px rgba(0,0,0,0.28)`). Replaces the prior
      // 1.5px ink border + hover-darken with the app-wide depth-via-
      // shadow vocabulary.
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
  /** B.PT300 — true while the save mutation is in flight. Disables
   *  Save/Remove + swaps Save copy to "Saving…". Also blocks
   *  `onClose` (via overlay click / Esc) so the user can't accidentally
   *  abandon a pending save. */
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
  // B.PT26 — chrome strings localized via the Availability namespace.
  // B.PT26B — day-name range compression + overlap-payload day list
  // now also localized; `useDayLabelStrings()` builds the
  // formatter-backed `DayLabelStrings` once + memoizes.
  const t = useTranslations("Availability");
  const labelStrings = useDayLabelStrings();
  const [draft, setDraft] = useState<BlockDraft>(state.draft);
  const [daysOpen, setDaysOpen] = useState(false);
  // Reset if the drawer is reused for a different block before unmount.
  useEffect(() => {
    setDraft(state.draft);
  }, [state]);

  // Map error keys returned by `validateDraft` to localized strings
  // here so the helper itself stays a pure (locale-agnostic) function.
  // The helper returns null | "needsDay" | "endBeforeStart" | overlap
  // text starting with `overlap:`. Overlap day names are produced via
  // `labelStrings.nameOf` so es-locale users see "lun, mié" not
  // "Mon, Wed."
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
            // B.PT295 — borderless. Tinted bg + drop shadow keeps the
            // alert visible without a contrasting ink frame.
            className="mt-5 rounded-(--oh-r-xs) bg-[color-mix(in_srgb,var(--oh-ink)_8%,var(--oh-paper))] px-3 py-2.5 font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase shadow-[0_3px_12px_rgba(0,0,0,0.22)]"
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer separator — switched from `border-t` to `.oh-rule`
          (B.PT288 paper-on-paper centered glow) so the chrome line
          matches the rest of the app. The `oh-rule` ::after sits at
          the bottom of its host, so we wrap a 0-height anchor div
          above the footer panel. */}
      <div className="oh-rule h-0" aria-hidden />
      <div className="bg-[color-mix(in_srgb,var(--oh-ink)_4%,var(--oh-paper))] p-4">
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
      // B.PT295 — same chrome as BlockChip. Borderless paper card +
      // canonical drop shadow + hover lift. Single drawer-trigger
      // vocabulary across the availability surface.
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
      // B.PT295 — borderless. Same drop-shadow vocabulary as the
      // outer drawer-trigger chips so the day toggles inside the
      // drawer share the same elevated-paper aesthetic. Active
      // state (selected) keeps ink fill + paper text — the shadow
      // works on both bg colors. Hover bumps the shadow on
      // unselected only (selected is "locked in" — no need for an
      // affordance bump).
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

// `formatDayLabel` and `validateDraft` moved to ./format-day-label.ts
// in B.PT26B. Importing both at the top of this file. Helpers here
// stay React-free so vitest property tests can import without the
// "use client" hop.

// Shared hook for the localized day-name strings used by chips,
// picker drawers, the modal description, and validateDraft's
// overlap-payload day list. Built once per render via useFormatter
// + useTranslations; consumers memoize the result.
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
