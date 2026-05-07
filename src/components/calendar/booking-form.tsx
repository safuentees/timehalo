"use client";

import type { HTMLInputTypeAttribute, InputHTMLAttributes } from "react";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { trpc } from "@/trpc/hooks";
import { useBookingCreate } from "@/lib/mutations/use-booking-create";
import { useRescheduleBooking } from "@/lib/mutations/use-reschedule-booking";
import { getBrowserTimezone } from "@/lib/timezone";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "@/lib/booking-schema";
import { cn } from "@/lib/utils";

type Props = {
  handle: string;
  slotStart: string; // ISO
  // A9 — reschedule mode. When set, the form swaps to a confirm-only
  // flow: no name/email/question fields (the new booking inherits
  // them from the original via the procedure). Submit calls
  // `bookings.reschedule` instead of `bookings.create`.
  rescheduleFromUid?: string;
};

/**
 * Visitor booking form rendered inside the BookingDrawer. Three fields:
 * name, email, question (optional). On submit, calls `bookings.create`
 * with the pre-selected slotStart passed in from the parent page.
 *
 * When `rescheduleFromUid` is set, the form renders a confirm-only
 * panel and submits via `bookings.reschedule`.
 */
export function BookingForm({ handle, slotStart, rescheduleFromUid }: Props) {
  if (rescheduleFromUid) {
    return (
      <RescheduleConfirm
        handle={handle}
        slotStart={slotStart}
        oldPublicUid={rescheduleFromUid}
      />
    );
  }
  return <CreateForm handle={handle} slotStart={slotStart} />;
}

function CreateForm({ handle, slotStart }: { handle: string; slotStart: string }) {
  const t = useTranslations("BookingCalendar");
  const router = useRouter();
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { visitorName: "", visitorEmail: "", question: "" },
    mode: "onBlur",
  });

  // Generate one idempotency key per form lifetime. A double-click,
  // a retry on a flaky network, or a back-then-resubmit will all
  // ship the SAME UUID — the server sees the second create and
  // returns the original booking instead of creating a duplicate.
  // Lazy initializer fires once on mount; closing and reopening the
  // drawer remounts the form and gets a fresh key, which is correct.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const book = useBookingCreate({
    onSuccess: (booking) => {
      form.reset();
      router.push(`/h/${handle}/booked/${booking.publicUid}`);
    },
  });

  function onSubmit(values: BookingFormValues) {
    book.mutate({
      handle,
      slotStart,
      idempotencyKey,
      visitorName: values.visitorName,
      visitorEmail: values.visitorEmail,
      question: values.question,
      // Capture the visitor's IANA zone at submit time. Server
      // validates + persists on Booking.visitorTimezone — drives
      // future reminder/confirmation rendering in the visitor's
      // local time.
      visitorTimezone: getBrowserTimezone(),
    });
  }

  // B.PT246 — port `docs/figma/recipe-schedule-confirm.md`. Three
  // structural changes on top of the visual port:
  //   1. Drop per-field `<FieldSet>` wrappers (FieldSet is a multi-
  //      field grouping primitive, inverted use here).
  //   2. Drop `<OhInputGroup>` for name/email — the Figma row layout
  //      is its own primitive (label LEFT / input RIGHT, paper bg
  //      + INNER_SHADOW r=4 + tiny hairline padding) inlined into a
  //      typed `<BookingTextField>` helper below.
  //   3. Submit error moves ABOVE the button (semantically belongs
  //      with the form, not under it).
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="oh-booking-form flex flex-col gap-5"
      >
        <FieldGroup className="flex flex-col gap-5">
          <BookingTextField
            name="visitorName"
            label={t("fieldName")}
            placeholder={t("fieldNamePlaceholder")}
            autoComplete="name"
            autoCapitalize="words"
          />
          <BookingTextField
            name="visitorEmail"
            label={t("fieldEmail")}
            placeholder={t("fieldEmailPlaceholder")}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <BookingTextareaField
            name="question"
            label={t("fieldQuestion")}
            placeholder={t("fieldQuestionPlaceholder")}
            rows={3}
            maxLength={500}
          />
        </FieldGroup>

        {book.error ? (
          <p className="oh-field-error" role="alert">
            {book.error.message}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="oh"
          size="oh"
          disabled={book.isPending}
          // Figma confirm-button: cornerRadius 10 (pill-ish CTA, NOT
          // the project's --oh-r-xs 2px), DROP_SHADOW r=15 halo, mono
          // 13 ExtraBold paper-on-ink (paper-on-ink baked into the
          // `oh` button variant). Direct `rounded-[10px]` arbitrary —
          // not promoted to a token until the pattern shows up
          // elsewhere.
          className="oh-book-submit h-9 rounded-[10px] font-mono text-[13px] font-extrabold shadow-[0_0_15px_rgba(0,0,0,0.25)]"
        >
          {book.isPending ? t("submitBookPending") : t("submitBook")}
        </Button>
      </form>
    </FormProvider>
  );
}

// ── Field helpers (B.PT246) ─────────────────────────────────────────
// Two narrow components instead of one polymorphic helper — keeps the
// `name` prop type-narrowed so `question` can't be passed to the text
// input or vice versa.

type BookingTextFieldName = Exclude<keyof BookingFormValues, "question">;
type BookingTextareaFieldName = Extract<keyof BookingFormValues, "question">;

function BookingTextField({
  name,
  label,
  placeholder,
  type = "text",
  ...inputProps
}: {
  name: BookingTextFieldName;
  label: string;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "type" | "placeholder"
>) {
  return (
    <Controller<BookingFormValues>
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {/* ROW: paper bg + INNER_SHADOW (Figma `INNER_SHADOW r=3.5`
              ≈ 4px). Hairline padding (0.5px) carries the spec. */}
          <div
            className={cn(
              "flex h-[33px] items-stretch overflow-hidden",
              "rounded-(--oh-r-xs) bg-[color:var(--oh-paper)]",
              "p-[0.5px]",
              "shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]",
            )}
          >
            {/* LABEL (left, ~63×32, mono 11 ExtraBold ink). NOT
                uppercase / no tracking — `Name` and `Email` are
                proper-case in the Figma spec, so we don't reach for
                `oh-legend` (which adds 2.5px tracking + uppercase). */}
            <label
              htmlFor={field.name}
              className="flex w-[63px] shrink-0 items-center pl-[6px] font-mono text-[11px] font-extrabold text-[color:var(--oh-ink)]"
            >
              {label}
            </label>
            {/* INPUT (right, drop-shadow halo on the input element
                itself; Figma `DROP_SHADOW r=4 offset=(0,4)`). */}
            <input
              {...field}
              {...inputProps}
              id={field.name}
              type={type}
              placeholder={placeholder}
              aria-invalid={fieldState.invalid}
              className={cn(
                "min-w-0 flex-1 bg-transparent px-[6px] py-[7px]",
                "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
                "outline-none",
                "shadow-[0_4px_4px_rgba(0,0,0,0.25)]",
              )}
            />
          </div>
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="oh-field-error"
          />
        </Field>
      )}
    />
  );
}

function BookingTextareaField({
  name,
  label,
  placeholder,
  rows = 3,
  maxLength,
}: {
  name: BookingTextareaFieldName;
  label: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Controller<BookingFormValues>
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {/* Component 4 in Figma: paper bg, 1px ink stroke,
              cornerRadius 2, DROP_SHADOW r=15 halo. Label is sr-only
              — placeholder doubles as the visible cue, matching the
              spec's structural intent. */}
          <label className="sr-only" htmlFor={field.name}>
            {label}
          </label>
          <textarea
            {...field}
            id={field.name}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className={cn(
              "w-full resize-none",
              "rounded-(--oh-r-xs) border border-[color:var(--oh-ink)]",
              "bg-[color:var(--oh-paper)]",
              "px-[12.5px] py-[10.5px]",
              "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
              "placeholder:text-[color:var(--oh-ink)] placeholder:opacity-55",
              "outline-none",
              "shadow-[0_0_15px_rgba(0,0,0,0.25)]",
            )}
          />
          <FieldError
            errors={fieldState.error ? [fieldState.error] : undefined}
            className="oh-field-error"
          />
        </Field>
      )}
    />
  );
}

// A9 — reschedule confirmation panel. The original booking carries
// its visitor name/email/question forward via the server-side
// reschedule transaction, so the visitor only needs to confirm the
// new slot. Renders the from→to delta inline; submits via
// `bookings.reschedule`.
function RescheduleConfirm({
  handle,
  slotStart,
  oldPublicUid,
}: {
  handle: string;
  slotStart: string;
  oldPublicUid: string;
}) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const reschedule = useRescheduleBooking({
    onSuccess: (result) => {
      router.push(`/h/${handle}/booked/${result.publicUid}`);
    },
  });

  // Look up the original booking so we can show the from→to delta.
  // Public procedure — same authorization shape as the booked page.
  const { data: original } = trpc.bookings.getPublicConfirmation.useQuery({
    handle,
    bookingUid: oldPublicUid,
  });

  const newStart = new Date(slotStart);
  const oldStart = original
    ? new Date(original.slotStart as unknown as string)
    : null;

  return (
    <div className="oh-booking-form flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-paper p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="oh-eyebrow opacity-55">{t("rescheduleFromLabel")}</span>
          <span className="font-[family-name:var(--oh-mono)] text-[13px] tabular-nums opacity-75 line-through">
            {oldStart ? fmtSlot(format, oldStart) : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="oh-eyebrow">{t("rescheduleToLabel")}</span>
          <span className="font-[family-name:var(--oh-mono)] text-[14px] font-bold tabular-nums">
            {fmtSlot(format, newStart)}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="oh"
        size="oh"
        disabled={reschedule.isPending}
        className="oh-book-submit"
        onClick={() => {
          reschedule.mutate({
            oldPublicUid,
            newSlotStart: slotStart,
            idempotencyKey,
            visitorTimezone: getBrowserTimezone(),
          });
        }}
      >
        {reschedule.isPending
          ? t("submitReschedulePending")
          : t("submitReschedule")}
      </Button>
      {reschedule.error ? (
        <p className="oh-field-error" role="alert">
          {reschedule.error.message}
        </p>
      ) : null}
    </div>
  );
}

// Locale-aware slot label via next-intl's useFormatter — honors the
// `oh_locale` cookie. Pre-B.PT101 used `toLocaleDateString` with
// `undefined` locale, which silently fell back to the browser locale.
function fmtSlot(format: ReturnType<typeof useFormatter>, d: Date): string {
  const day = format
    .dateTime(d, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
  const time = format.dateTime(d, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}
