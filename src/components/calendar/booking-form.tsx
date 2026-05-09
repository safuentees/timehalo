"use client";

import type { HTMLInputTypeAttribute, InputHTMLAttributes } from "react";
import { useState, useTransition } from "react";
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
  rescheduleFromUid?: string;
  durationMinutes?: number;
};

export function BookingForm({
  handle,
  slotStart,
  rescheduleFromUid,
  durationMinutes,
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
  return (
    <CreateForm
      handle={handle}
      slotStart={slotStart}
      durationMinutes={durationMinutes}
      onBooked={onBooked}
    />
  );
}

function CreateForm({
  handle,
  slotStart,
  durationMinutes,
  onBooked,
}: {
  handle: string;
  slotStart: string;
  durationMinutes?: number;
  onBooked?: () => void;
}) {
  const t = useTranslations("BookingCalendar");
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { visitorName: "", visitorEmail: "", question: "" },
    mode: "onBlur",
  });

  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const book = useBookingCreate({
    onSuccess: (booking) => {
      startTransition(() => {
        router.push(`/h/${handle}/booked/${booking.publicUid}`);
        onBooked?.();
      });
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
      visitorTimezone: getBrowserTimezone(),
      durationMinutes,
    });
  }

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
          disabled={book.isPending || isTransitionPending}
          className={BOOKING_SUBMIT_BUTTON_CLASS}
        >
          {book.isPending || isTransitionPending
            ? t("submitBookPending")
            : t("submitBook")}
        </Button>
      </form>
    </FormProvider>
  );
}

type BookingTextFieldName = Exclude<keyof BookingFormValues, "question">;
type BookingTextareaFieldName = Extract<keyof BookingFormValues, "question">;

const BOOKING_FIELD_SURFACE_CLASS = cn(
  "rounded-(--oh-r-xs) bg-[color:var(--oh-paper)]",
  "[box-shadow:var(--oh-input-shadow-rest)]",
  "transition-[background-color,box-shadow] duration-150 ease-oh",
);

export const BOOKING_SUBMIT_BUTTON_CLASS = cn(
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
          <div className="grid gap-2">
            <label htmlFor={field.name} className="oh-legend">
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
                "h-[33px] min-w-0 px-4 py-[7px]",
                BOOKING_FIELD_SURFACE_CLASS,
                "focus:bg-[var(--oh-input-bg-focus)]",
                "focus:[box-shadow:var(--oh-focus-shadow-input)]",
                "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
                "placeholder:text-[color:var(--oh-ink)] placeholder:opacity-55",
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
              "px-4 py-[10.5px]",
              "font-sans text-[14px] leading-[18px] text-[color:var(--oh-ink)]",
              "placeholder:text-[color:var(--oh-ink)] placeholder:opacity-55",
              "outline-none",
              "focus:bg-[var(--oh-input-bg-focus)]",
              "focus:[box-shadow:inset_0_3px_10px_rgba(0,0,0,0.32)]",
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
  const [isTransitionPending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const reschedule = useRescheduleBooking({
    onSuccess: (result) => {
      startTransition(() => {
        router.push(`/h/${handle}/booked/${result.publicUid}`);
        onBooked?.();
      });
    },
  });

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
        disabled={reschedule.isPending || isTransitionPending}
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
        {reschedule.isPending || isTransitionPending
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
