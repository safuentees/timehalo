"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/hooks";
import { useSetDurations } from "@/lib/mutations/use-set-durations";
import {
  DURATION_LIST_MAX_LENGTH,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from "@/lib/durations";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/oh/section-header";

// B.PT274 — Profile durations editor.
//
// Same drawer-row UX as `/availability` (chip list + add row + edit
// drawer). Stripped down because a duration is a single integer, not
// a (days, from, to) triple — the drawer holds one numeric input
// instead of the three-field availability draft. Save/Remove + the
// outer chip list re-use the visual chrome from
// `availability-fields.tsx` so the two pages read as one vocabulary.
//
// State: server-truth via `users.me`; local "draft" state in the
// editor opens with either the existing chip's value or a blank slate.
// The mutation persists the FULL list in one call (server schema
// dedup+sorts via the transform) — same shape as the availability
// schedule.save flow.

const FALLBACK_DEFAULT_MINUTES = 30;

type EditorState =
  | { mode: "new"; value: number | "" }
  | { mode: "edit"; original: number; value: number | "" };

export function DurationFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();
  const list = me?.durations.list ?? [];
  const defaultMinutes = me?.durations.defaultMinutes ?? FALLBACK_DEFAULT_MINUTES;
  const [editor, setEditor] = useState<EditorState | null>(null);

  const setDurations = useSetDurations({
    onSuccess: () => {
      setEditor(null);
    },
  });

  async function persist(next: number[]) {
    await setDurations.mutateAsync({ minutes: next });
  }

  async function handleSave(minutes: number) {
    if (!editor) return;
    const withoutEditing =
      editor.mode === "edit"
        ? list.filter((m) => m !== editor.original)
        : list;
    if (withoutEditing.includes(minutes)) {
      // Duplicate guard — schema would dedupe silently, but the user
      // would see the chip "merge" without feedback. Surface the error
      // so they know nothing happened.
      throw new Error(t("durationsDuplicateError"));
    }
    const next = [...withoutEditing, minutes];
    try {
      await persist(next);
    } catch {
      // Mutation hook already toasted; rethrow so the editor stays
      // mounted (state still set; close-on-success path didn't fire).
      throw new Error("persist-failed");
    }
  }

  async function handleRemove() {
    if (!editor || editor.mode !== "edit") return;
    const next = list.filter((m) => m !== editor.original);
    try {
      await persist(next);
    } catch {
      // Same as handleSave — keep drawer open on error.
    }
  }

  const canAdd = list.length < DURATION_LIST_MAX_LENGTH;

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
                <DurationChip
                  minutes={minutes}
                  isDefault={minutes === defaultMinutes}
                  onEdit={() =>
                    setEditor({ mode: "edit", original: minutes, value: minutes })
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
          disabled={!canAdd}
          onClick={() => setEditor({ mode: "new", value: "" })}
          // Same dual-mode (mobile dotted full-width, desktop content-
          // sized link-style) treatment as availability's "Add more
          // hours" CTA — keeps the editor's "tap to add" affordance
          // visually equivalent across surfaces.
          className={cn(
            "w-full justify-center border-dotted border-[var(--oh-line-placeholder)] hover:border-transparent",
            "md:w-auto md:self-start md:border-0 md:bg-transparent md:hover:bg-[var(--oh-tint)] md:hover:text-[var(--oh-ink)]",
          )}
        >
          <PlusIcon /> {t("durationsAddLabel")}
        </Button>
      </div>

      <DurationEditorDrawer
        state={editor}
        existing={
          editor?.mode === "edit"
            ? list.filter((m) => m !== editor.original)
            : list
        }
        onClose={() => setEditor(null)}
        onSave={handleSave}
        onRemove={editor?.mode === "edit" ? handleRemove : undefined}
        isPending={setDurations.isPending}
      />
    </section>
  );
}

function EmptyDurations() {
  const t = useTranslations("Profile");
  return (
    <div className="rounded-(--oh-r-sm) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] px-5 py-7 text-left">
      <p className="oh-eyebrow">{t("durationsEmpty")}</p>
      <p className="oh-description mt-2">
        {t("durationsEmptyHint")}
      </p>
    </div>
  );
}

function DurationChip({
  minutes,
  isDefault,
  onEdit,
}: {
  minutes: number;
  isDefault: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("Profile");
  const summary = formatDurationSummary(minutes, t);
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group relative flex w-full items-center gap-3 rounded-(--oh-r-sm) bg-[var(--oh-paper)] px-5 py-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[0_4px_16px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-ink)]"
      aria-label={t("durationsEditAria", { label: summary })}
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
        className="size-4 shrink-0 opacity-45 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}

function DurationEditorDrawer({
  state,
  existing,
  onClose,
  onSave,
  onRemove,
  isPending,
}: {
  state: EditorState | null;
  existing: number[];
  onClose: () => void;
  onSave: (minutes: number) => Promise<void>;
  onRemove?: () => Promise<void> | void;
  isPending: boolean;
}) {
  return (
    <ResponsiveModal
      open={state !== null}
      onOpenChange={(open) => {
        if (open) return;
        if (isPending) return;
        onClose();
      }}
    >
      <ResponsiveModalContent defaultClose={false}>
        {state ? (
          <DurationEditorContent
            key={state.mode === "edit" ? `edit-${state.original}` : "new"}
            state={state}
            existing={existing}
            onSave={onSave}
            onRemove={onRemove}
            isPending={isPending}
          />
        ) : null}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function DurationEditorContent({
  state,
  existing,
  onSave,
  onRemove,
  isPending,
}: {
  state: EditorState;
  existing: number[];
  onSave: (minutes: number) => Promise<void>;
  onRemove?: () => Promise<void> | void;
  isPending: boolean;
}) {
  const t = useTranslations("Profile");
  const [value, setValue] = useState<number | "">(state.value);
  // Reset draft when the drawer is reused for a different chip before
  // unmount.
  useEffect(() => {
    setValue(state.value);
  }, [state]);

  const error = validateDurationDraft(value, existing, t);
  const canSave = error === null;
  const summary =
    typeof value === "number"
      ? formatDurationSummary(value, t)
      : t("durationsValueLabel");

  async function handleSave() {
    if (typeof value !== "number") return;
    try {
      await onSave(value);
    } catch {
      // onSave throws on duplicate / persist failure; keep drawer open.
    }
  }

  return (
    <>
      <div className="border-b border-[var(--oh-line-firm)] px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <ResponsiveModalTitle className="font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2.5px] uppercase opacity-65">
              {state.mode === "edit"
                ? t("durationsEditTitle")
                : t("durationsNewTitle")}
            </ResponsiveModalTitle>
            <p className="mt-2 text-[22px] leading-[1.05] font-black uppercase tabular-nums">
              {summary}
            </p>
            <ResponsiveModalDescription className="sr-only">
              {t("durationsValueAria")}
            </ResponsiveModalDescription>
          </div>
          <ResponsiveModalClose />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="oh-eyebrow">{t("durationsValueLegend")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={DURATION_MIN_MINUTES}
              max={DURATION_MAX_MINUTES}
              step={5}
              value={value === "" ? "" : value}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setValue("");
                  return;
                }
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                setValue(Math.round(parsed));
              }}
              aria-label={t("durationsValueAria")}
              aria-invalid={error !== null}
              className="oh-input text-[18px] tabular-nums"
              autoFocus
            />
          </label>
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
              <Trash2Icon /> {t("durationsRemove")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="oh"
            size="oh"
            onClick={handleSave}
            disabled={!canSave || isPending}
            className="w-full justify-center rounded-(--oh-r-xs) md:w-auto"
          >
            <CheckIcon />{" "}
            {isPending
              ? t("durationsSaving")
              : state.mode === "edit"
                ? t("durationsSave")
                : t("durationsAdd")}
          </Button>
        </div>
      </div>
    </>
  );
}

// ——— Helpers ———

function validateDurationDraft(
  value: number | "",
  existing: number[],
  t: ReturnType<typeof useTranslations<"Profile">>,
): string | null {
  if (value === "") return t("durationsRangeError");
  if (
    !Number.isInteger(value) ||
    value < DURATION_MIN_MINUTES ||
    value > DURATION_MAX_MINUTES
  ) {
    return t("durationsRangeError");
  }
  if (existing.length >= DURATION_LIST_MAX_LENGTH) {
    return t("durationsCapError");
  }
  if (existing.includes(value)) {
    return t("durationsDuplicateError");
  }
  return null;
}

// "75 min" → "1 hr 15 min", "60" → "1 hr", "30" → "30 min". Uses the
// hr/min summary keys so locales control the unit shape; the chip
// label + the drawer title both read as the same humanized string.
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
