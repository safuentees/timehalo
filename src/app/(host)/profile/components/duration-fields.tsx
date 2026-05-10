"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import animSpec from "@/../docs/figma/anim-h-handle-redesign.json";
import { trpc } from "@/trpc/hooks";
import { useSetDurations } from "@/lib/mutations/use-set-durations";
import {
  DURATION_DESCRIPTION_MAX_LENGTH,
  DURATION_LIST_MAX_LENGTH,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  DURATION_TITLE_MAX_LENGTH,
} from "@/lib/durations";
import { SectionHeader } from "@/components/oh/section-header";
import { InlineFormSave } from "@/components/oh/inline-form-save";

// Profile durations editor (B.PT303 — inline-expand row variant).
//
// Each row is a chip-shaped summary that expands inline when clicked
// to reveal title / minutes / description editors. No popover, no
// drawer — the expanded form sits in the column flow, sliding the
// chips below it down to accommodate. Closing a row by clicking
// another row keeps the editor focused on one item at a time.
//
// Why inline rather than the prior popover (B.PT274): three fields
// per chip (vs. one) overflowed the popover's natural width on
// mobile and made the surface feel like a dialog-in-disguise.
// Inline keeps the layout language consistent with `/availability`,
// which uses the same row-expand language for daily windows.
//
// Motion: every height/position change rides the same Spring tuning
// as `/h/[handle]` (`animSpec.transitions[0]` for open,
// `transitions[2]` for close) so the dashboard's edit chrome and
// the visitor surface agree on motion language. The outer row gets
// `layout` so its height tweens when the form mounts/unmounts; the
// form itself fades in via `<AnimatePresence>`. Per
// `.claude/rules/motion-shared-layout.md`, no shared `layoutId` is
// used here — these animations are within-row size changes, not
// cross-element morphs, so plain `layout` is the right primitive.
//
// Save semantics — matches the bio/handle sections above. Field
// edits update LOCAL form state (`shouldDirty: true`); the
// section's `<InlineFormSave>` appears when dirty and commits the
// whole list via `users.setDurationsList`. Add row uses a separate
// `appendDraft` flow so an empty in-progress entry never lands in
// the form value (validation would fail on `minutes: 0`).

const OPEN_SPRING = animSpec.transitions[0].spring;
const CLOSE_SPRING =
  animSpec.transitions.find(
    (t) => t.event === "ON_BACK" || t.event === "DISMISS",
  )?.spring ?? animSpec.transitions[2].spring;

const ROW_TRANSITION = { type: "spring", ...OPEN_SPRING } as const;
const ROW_EXIT_TRANSITION = { type: "spring", ...CLOSE_SPRING } as const;

const optionFormSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(DURATION_MIN_MINUTES)
    .max(DURATION_MAX_MINUTES),
  title: z
    .string()
    .max(DURATION_TITLE_MAX_LENGTH)
    .nullable(),
  description: z
    .string()
    .max(DURATION_DESCRIPTION_MAX_LENGTH)
    .nullable(),
});

const formSchema = z.object({
  list: z.array(optionFormSchema).max(DURATION_LIST_MAX_LENGTH),
});
type FormValues = z.infer<typeof formSchema>;

export function DurationFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({
      list:
        me?.durations.list.map((opt) => ({
          minutes: opt.minutes,
          title: opt.title ?? null,
          description: opt.description ?? null,
        })) ?? [],
    }),
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
    await setDurations.mutateAsync({
      list: v.list.map((opt) => ({
        minutes: opt.minutes,
        title: opt.title,
        description: opt.description,
      })),
    });
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

function DurationFieldsBody() {
  const t = useTranslations("Profile");
  const { control } = useFormContext<FormValues>();
  const { fields, append, remove, update } = useFieldArray<
    FormValues,
    "list",
    "fieldId"
  >({
    control,
    name: "list",
    keyName: "fieldId",
  });

  // Lifted "which row is expanded" state. Only one row open at a
  // time keeps the column from growing to ~600px when every row is
  // expanded; also gives a visual "you're editing this one" cue.
  // Encoding: number → existing row index, "add" → the add-row
  // draft, null → all collapsed.
  const [openKey, setOpenKey] = useState<number | "add" | null>(null);

  const list = useWatch<FormValues, "list">({ name: "list" }) ?? [];
  const canAdd = list.length < DURATION_LIST_MAX_LENGTH;

  function handleAddCommit(opt: {
    minutes: number;
    title: string | null;
    description: string | null;
  }) {
    if (list.some((o) => o.minutes === opt.minutes)) return;
    append(opt, { shouldFocus: false });
    setOpenKey(null);
  }

  return (
    <section aria-labelledby="durations-legend">
      <SectionHeader
        legendId="durations-legend"
        legend={t("durationsLegend")}
        description={t("durationsDescription")}
      />
      <div className="mt-5 flex flex-col gap-2.5">
        {fields.length === 0 && openKey !== "add" ? <EmptyDurations /> : null}

        <ul role="list" className="flex flex-col gap-2.5">
          {fields.map((field, index) => (
            <li key={field.fieldId}>
              <DurationRow
                index={index}
                isOpen={openKey === index}
                onToggle={() =>
                  setOpenKey(openKey === index ? null : index)
                }
                onRemove={() => {
                  remove(index);
                  setOpenKey(null);
                }}
                onCommitMinutes={(minutes) => {
                  // De-dupe across siblings before persisting.
                  if (
                    list.some(
                      (o, i) => i !== index && o.minutes === minutes,
                    )
                  ) {
                    return false;
                  }
                  update(index, { ...list[index]!, minutes });
                  return true;
                }}
                otherMinutes={list
                  .filter((_, i) => i !== index)
                  .map((o) => o.minutes)}
              />
            </li>
          ))}
        </ul>

        <AddRow
          isOpen={openKey === "add"}
          disabled={!canAdd}
          onToggle={() => setOpenKey(openKey === "add" ? null : "add")}
          onCommit={handleAddCommit}
          existingMinutes={list.map((o) => o.minutes)}
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

// Single row — collapsed shows summary; expanded shows in-place
// editor.
//
// Why grid-template-rows + overflow:hidden instead of motion's
// `layout` prop: motion's layout animation drives parent size with
// `transform: scale()`, which propagates to children. The form's
// inputs visibly stretch during open / shrink during close — the
// stretch the user reported. The shadcn / Radix Accordion primitive
// solves this with pure-CSS height interpolation (`overflow:hidden`
// + animated `height` from 0 to `--radix-accordion-content-height`),
// and the framer-motion canonical pattern is the equivalent
// `gridTemplateRows: "0fr" → "1fr"` trick — the grid track grows /
// shrinks and the inner div clips. NO transform, NO scaling, content
// stays at its intrinsic size. Spring physics still apply via
// motion's `animate` prop, with directional springs (`openSpring`
// when expanding, `closeSpring` when collapsing) so the close
// animation matches the open animation's feel — same physics field-
// tested on the /h/[handle] chip morph.
//
// Reference: `src/components/ui/accordion.tsx` (shadcn) uses the
// same pure-CSS height pattern; we adapt it to keep motion's spring
// tuning so the editor reads as part of the same motion vocabulary
// as the visitor surface.
function DurationRow({
  index,
  isOpen,
  onToggle,
  onRemove,
  onCommitMinutes,
  otherMinutes,
}: {
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onRemove: () => void;
  // Returns false when the picked minutes collides with another
  // row; the caller surfaces that as inline error state.
  onCommitMinutes: (minutes: number) => boolean;
  otherMinutes: number[];
}) {
  const t = useTranslations("Profile");
  const { register, control, setValue } = useFormContext<FormValues>();

  const row = useWatch<FormValues, `list.${number}`>({
    control,
    name: `list.${index}`,
  });
  const minutes = row?.minutes ?? 0;
  const title = row?.title ?? null;

  const summary = formatDurationSummary(minutes, t);
  const caption = title && title.trim().length > 0 ? title : summary;
  const transition = isOpen ? ROW_TRANSITION : ROW_EXIT_TRANSITION;

  return (
    <article
      className="rounded-(--oh-r-sm) bg-[var(--oh-paper)] shadow-[var(--oh-shadow-resting)] transition-shadow duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)] data-[open=true]:shadow-[var(--oh-shadow-hover)]"
      data-open={isOpen}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="oh-focus-ring group/row flex w-full items-center gap-3 rounded-(--oh-r-sm) px-5 py-4 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="oh-eyebrow">
            {title && title.trim().length > 0
              ? summary
              : t("durationsValueLegend")}
          </span>
          <span className="text-[18px] leading-[1.1] font-black tabular-nums truncate">
            {caption}
          </span>
        </span>
        <ChevronDownIcon
          className="size-4 shrink-0 opacity-45 transition-[opacity,transform] duration-150 ease-oh group-hover/row:opacity-100 data-[open=true]:rotate-180 data-[open=true]:opacity-100"
          aria-hidden
          data-open={isOpen}
        />
      </button>

      {/* Grid-template-rows trick: the outer grid track grows from
          0fr to 1fr (or shrinks back) under spring physics; the
          inner div's `min-h-0 + overflow-hidden` lets the track
          actually go to 0 (without min-h-0 the intrinsic content
          height pushes through). Content keeps its intrinsic size
          throughout — no transform, no scaling, no text stretch. */}
      <motion.div
        initial={false}
        animate={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
        transition={transition}
        style={{ display: "grid" }}
        aria-hidden={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 border-t border-oh-line px-5 py-5">
            <FieldBlock
              legendId={`duration-${index}-title`}
              legend={t("durationsTitleLabel")}
              description={t("durationsTitleHint")}
            >
              <input
                {...register(`list.${index}.title`, {
                  setValueAs: (v: string) => {
                    const trimmed = (v ?? "").trim();
                    return trimmed.length === 0 ? null : trimmed;
                  },
                })}
                type="text"
                maxLength={DURATION_TITLE_MAX_LENGTH}
                placeholder={t("durationsTitlePlaceholder")}
                defaultValue={title ?? ""}
                className="oh-input"
                aria-labelledby={`duration-${index}-title`}
                tabIndex={isOpen ? 0 : -1}
              />
            </FieldBlock>

            <FieldBlock
              legendId={`duration-${index}-minutes`}
              legend={t("durationsValueLegend")}
              description={t("durationsMinutesHint")}
            >
              <MinutesInput
                initial={minutes}
                otherMinutes={otherMinutes}
                disabled={!isOpen}
                onCommit={(picked) => {
                  if (picked === minutes) return;
                  if (!onCommitMinutes(picked)) return;
                  // The parent's update call is the source of
                  // truth; the input's own value rebinds on the
                  // next render via useWatch.
                }}
              />
            </FieldBlock>

            <FieldBlock
              legendId={`duration-${index}-desc`}
              legend={t("durationsDescriptionLabel")}
              description={t("durationsDescriptionHint")}
            >
              <textarea
                {...register(`list.${index}.description`, {
                  setValueAs: (v: string) => {
                    const trimmed = (v ?? "").trim();
                    return trimmed.length === 0 ? null : trimmed;
                  },
                })}
                rows={3}
                maxLength={DURATION_DESCRIPTION_MAX_LENGTH}
                placeholder={t("durationsDescriptionPlaceholder")}
                defaultValue={row?.description ?? ""}
                className="oh-input min-h-[80px] resize-y"
                aria-labelledby={`duration-${index}-desc`}
                tabIndex={isOpen ? 0 : -1}
              />
            </FieldBlock>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={onRemove}
                tabIndex={isOpen ? 0 : -1}
                className="oh-focus-ring inline-flex items-center gap-1.5 rounded-(--oh-r-xs) text-[12px] font-medium text-[color:var(--oh-content-muted)] transition-colors duration-150 ease-oh hover:text-[var(--oh-ink)]"
              >
                <Trash2Icon className="size-3.5" strokeWidth={1.75} />
                {t("durationsRemove")}
              </button>
              <button
                type="button"
                onClick={() => {
                  // The form is the source of truth; collapse just
                  // closes the editor. Parent's `setValue` calls
                  // through register already wrote the trimmed
                  // values back into the list.
                  setValue(`list.${index}`, {
                    minutes,
                    title,
                    description: row?.description ?? null,
                  });
                  onToggle();
                }}
                tabIndex={isOpen ? 0 : -1}
                className="oh-focus-ring rounded-(--oh-r-xs) text-[12px] font-semibold text-[var(--oh-ink)] transition-colors duration-150 ease-oh hover:underline"
              >
                {t("durationsDoneLabel")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </article>
  );
}

// Add row — same chrome shape as DurationRow but starts collapsed
// with a "+ Add duration" caption. Expands into a draft form whose
// state is local until Save (the form's `list` doesn't carry
// half-typed entries that would fail schema validation).
function AddRow({
  isOpen,
  disabled,
  onToggle,
  onCommit,
  existingMinutes,
}: {
  isOpen: boolean;
  disabled: boolean;
  onToggle: () => void;
  onCommit: (opt: {
    minutes: number;
    title: string | null;
    description: string | null;
  }) => void;
  existingMinutes: number[];
}) {
  const t = useTranslations("Profile");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMinutes, setDraftMinutes] = useState<number | null>(null);
  const [draftDesc, setDraftDesc] = useState("");

  function reset() {
    setDraftTitle("");
    setDraftMinutes(null);
    setDraftDesc("");
  }

  function commit() {
    if (
      draftMinutes === null ||
      draftMinutes < DURATION_MIN_MINUTES ||
      draftMinutes > DURATION_MAX_MINUTES ||
      existingMinutes.includes(draftMinutes)
    ) {
      return;
    }
    onCommit({
      minutes: draftMinutes,
      title: draftTitle.trim().length > 0 ? draftTitle.trim() : null,
      description: draftDesc.trim().length > 0 ? draftDesc.trim() : null,
    });
    reset();
  }

  const canSave =
    draftMinutes !== null &&
    draftMinutes >= DURATION_MIN_MINUTES &&
    draftMinutes <= DURATION_MAX_MINUTES &&
    !existingMinutes.includes(draftMinutes);

  const transition = isOpen ? ROW_TRANSITION : ROW_EXIT_TRANSITION;

  // Add row keeps the trigger ALWAYS mounted (collapsed = small "+
  // Add duration" pill) — same grid-template-rows trick as
  // DurationRow above. Trigger sits in the row's header band; the
  // form panel below grows / shrinks via the grid track.
  return (
    <article
      className="self-start rounded-(--oh-r-sm) transition-shadow duration-150 ease-oh data-[open=true]:bg-[var(--oh-paper)] data-[open=true]:self-stretch data-[open=true]:shadow-[var(--oh-shadow-hover)]"
      data-open={isOpen}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled && !isOpen}
        aria-expanded={isOpen}
        aria-label={t("durationsAddLabel")}
        className="oh-focus-ring inline-flex w-full items-center gap-2 rounded-(--oh-r-sm) px-3 py-2 text-[13px] font-medium text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-[color:var(--oh-content-muted)] data-[open=true]:bg-transparent data-[open=true]:px-5 data-[open=true]:py-3 data-[open=true]:text-[var(--oh-ink)] data-[open=true]:hover:bg-transparent"
        data-open={isOpen}
      >
        <PlusIcon
          className="size-4 transition-transform duration-150 ease-oh data-[open=true]:rotate-45"
          strokeWidth={1.75}
          aria-hidden
          data-open={isOpen}
        />
        <span className="data-[open=true]:oh-eyebrow data-[open=true]:tracking-[2.5px]" data-open={isOpen}>
          {isOpen ? t("durationsAddTitle") : t("durationsAddLabel")}
        </span>
      </button>

      {/* Same grid-template-rows trick as DurationRow — pure CSS
          height tween, no transform, content keeps its intrinsic
          size. Spring physics direction-aware so close eases out
          with the same feel as open. */}
      <motion.div
        initial={false}
        animate={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
        transition={transition}
        style={{ display: "grid" }}
        aria-hidden={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 border-t border-oh-line px-5 py-5">
            <FieldBlock
              legendId="duration-add-title"
              legend={t("durationsTitleLabel")}
              description={t("durationsTitleHint")}
            >
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={DURATION_TITLE_MAX_LENGTH}
                placeholder={t("durationsTitlePlaceholder")}
                className="oh-input"
                aria-labelledby="duration-add-title"
                tabIndex={isOpen ? 0 : -1}
              />
            </FieldBlock>

            <FieldBlock
              legendId="duration-add-minutes"
              legend={t("durationsValueLegend")}
              description={t("durationsMinutesHint")}
            >
              <MinutesInput
                initial={null}
                otherMinutes={existingMinutes}
                onCommit={(picked) => setDraftMinutes(picked)}
                disabled={!isOpen}
              />
            </FieldBlock>

            <FieldBlock
              legendId="duration-add-desc"
              legend={t("durationsDescriptionLabel")}
              description={t("durationsDescriptionHint")}
            >
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={3}
                maxLength={DURATION_DESCRIPTION_MAX_LENGTH}
                placeholder={t("durationsDescriptionPlaceholder")}
                className="oh-input min-h-[80px] resize-y"
                aria-labelledby="duration-add-desc"
                tabIndex={isOpen ? 0 : -1}
              />
            </FieldBlock>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  reset();
                  onToggle();
                }}
                tabIndex={isOpen ? 0 : -1}
                className="oh-focus-ring rounded-(--oh-r-xs) text-[12px] font-medium text-[color:var(--oh-content-muted)] transition-colors duration-150 ease-oh hover:text-[var(--oh-ink)]"
              >
                {t("durationsCancelLabel")}
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={!canSave}
                tabIndex={isOpen ? 0 : -1}
                className="oh-focus-ring rounded-(--oh-r-xs) bg-[var(--oh-ink)] px-4 py-2 text-[12px] font-semibold text-[var(--oh-paper)] transition-opacity duration-150 ease-oh disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t("durationsSave")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </article>
  );
}

function FieldBlock({
  legendId,
  legend,
  description,
  children,
}: {
  legendId: string;
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={legendId} id={legendId} className="oh-eyebrow">
        {legend}
      </label>
      {description ? (
        <p className="oh-description max-w-[42ch]">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

// Numeric input with onCommit semantics — fires once on blur OR
// Enter, after validating range + duplicate. Keeps the parent free
// of per-keystroke updates that would dirty the form on every digit.
function MinutesInput({
  initial,
  otherMinutes,
  onCommit,
  disabled,
}: {
  initial: number | null;
  otherMinutes: number[];
  onCommit: (minutes: number) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string>(
    initial !== null ? String(initial) : "",
  );

  const t = useTranslations("Profile");

  function tryCommit() {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed < DURATION_MIN_MINUTES || parsed > DURATION_MAX_MINUTES) return;
    if (otherMinutes.includes(parsed)) return;
    onCommit(parsed);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={DURATION_MIN_MINUTES}
        max={DURATION_MAX_MINUTES}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={tryCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            tryCommit();
          }
        }}
        tabIndex={disabled ? -1 : 0}
        className="oh-input w-24 text-center tabular-nums"
        aria-label={t("durationsValueLegend")}
      />
      <span className="oh-description shrink-0 normal-case">
        {t("durationsMinuteSuffix")}
      </span>
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
