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
  rescheduleFromUid?: string;
};

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
      visitorTimezone: getBrowserTimezone(),
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
          disabled={book.isPending}
          className="oh-book-submit h-9 rounded-[10px] font-mono text-[13px] font-extrabold shadow-[0_0_15px_rgba(0,0,0,0.25)]"
        >
          {book.isPending ? t("submitBookPending") : t("submitBook")}
        </Button>
      </form>
    </FormProvider>
  );
}

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
          <div
            className={cn(
              "flex h-[33px] items-stretch overflow-hidden",
              "rounded-(--oh-r-xs) bg-[color:var(--oh-paper)]",
              "p-[0.5px]",
              "shadow-[inset_0_0_4px_rgba(0,0,0,0.25)]",
            )}
          >
            <label
              htmlFor={field.name}
              className="flex w-[63px] shrink-0 items-center pl-[6px] font-mono text-[11px] font-extrabold text-[color:var(--oh-ink)]"
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
