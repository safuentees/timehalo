"use client";

import type { HTMLInputTypeAttribute, InputHTMLAttributes } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  onBooked?: () => void;
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
export function BookingForm({
  handle,
  slotStart,
  rescheduleFromUid,
  onBooked,
}: Props) {
  if (rescheduleFromUid) {
    return (
      <RescheduleConfirm
        handle={handle}
        slotStart={slotStart}
        oldPublicUid={rescheduleFromUid}
        onBooked={onBooked}
      />
    );
  }
  return <CreateForm handle={handle} slotStart={slotStart} onBooked={onBooked} />;
}

function CreateForm({
  handle,
  slotStart,
  onBooked,
}: {
  handle: string;
  slotStart: string;
  onBooked?: () => void;
}) {
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
      onBooked?.();
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
          className={BOOKING_SUBMIT_BUTTON_CLASS}
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

const BOOKING_FIELD_SURFACE_CLASS = cn(
  "rounded-(--oh-r-xs) bg-[color:var(--oh-paper)]",
  "shadow-[inset_0_0_4px_rgba(0,0,0,0.15)]",
  "transition-[background-color,box-shadow] duration-150 ease-oh",
  "hover:bg-[var(--oh-input-bg-hover)]",
);

const BOOKING_SUBMIT_BUTTON_CLASS = cn(
  "oh-book-submit h-9 rounded-[10px] font-mono text-[13px] font-extrabold",
  "shadow-[0_0_15px_rgba(0,0,0,0.25)]",
  "hover:!bg-oh-ink hover:!text-oh-paper",
  "active:translate-y-px active:shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
);

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
          {/* Match the route's day cells/time chips: each row is a
              borderless paper field with soft inset depth. The active
              state switches to the global input focus token so focus
              remains visible without adding another rest treatment. */}
          <div
            className={cn(
              "flex h-[33px] items-stretch",
              BOOKING_FIELD_SURFACE_CLASS,
              "focus-within:bg-[var(--oh-input-bg-focus)]",
              "focus-within:[box-shadow:var(--oh-focus-shadow-input)]",
            )}
          >
            {/* LABEL — `oh-legend` (mono 11 ExtraBold + 2.5px
                tracking + uppercase) with `opacity-100` to match the
                Figma spec's 1.0 opacity. Per oh-ui.md: compose
                `oh-legend opacity-100` rather than re-inlining the
                eight-class string. */}
            <label
              htmlFor={field.name}
              className="oh-legend flex w-[63px] shrink-0 items-center pl-[6px] opacity-100"
            >
              {label}
            </label>
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
          {/* Same visual shell as name/email; the placeholder remains
              the visible cue while the sr-only label preserves the
              form name for assistive technology. */}
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
              BOOKING_FIELD_SURFACE_CLASS,
              "px-[12.5px] py-[10.5px]",
              "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
              "placeholder:text-[color:var(--oh-ink)] placeholder:opacity-55",
              "outline-none",
              "focus:bg-[var(--oh-input-bg-focus)]",
              "focus:[box-shadow:var(--oh-focus-shadow-input)]",
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
  onBooked,
}: {
  handle: string;
  slotStart: string;
  oldPublicUid: string;
  onBooked?: () => void;
}) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const reschedule = useRescheduleBooking({
    onSuccess: (result) => {
      onBooked?.();
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
