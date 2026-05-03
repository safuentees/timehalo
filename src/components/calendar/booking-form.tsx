"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import { trpc } from "@/trpc/hooks";
import { useBookingCreate } from "@/lib/mutations/use-booking-create";
import { useRescheduleBooking } from "@/lib/mutations/use-reschedule-booking";
import { getBrowserTimezone } from "@/lib/timezone";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "@/lib/booking-schema";

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="oh-booking-form">
        <FieldGroup>
          <FieldSet>
            <FieldGroup>
              <Controller<BookingFormValues>
                name="visitorName"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <OhInputGroup>
                      <OhInputGroupInput
                        {...field}
                        id={field.name}
                        placeholder={t("fieldNamePlaceholder")}
                        autoComplete="name"
                        autoCapitalize="words"
                        aria-invalid={fieldState.invalid}
                      />
                      <OhInputGroupAddon align="inline-start">
                        <OhInputGroupText>{t("fieldName")}</OhInputGroupText>
                      </OhInputGroupAddon>
                    </OhInputGroup>
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="oh-field-error"
                    />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldGroup>
              <Controller<BookingFormValues>
                name="visitorEmail"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <OhInputGroup>
                      <OhInputGroupInput
                        {...field}
                        id={field.name}
                        type="email"
                        placeholder={t("fieldEmailPlaceholder")}
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={fieldState.invalid}
                      />
                      <OhInputGroupAddon align="inline-start">
                        <OhInputGroupText>{t("fieldEmail")}</OhInputGroupText>
                      </OhInputGroupAddon>
                    </OhInputGroup>
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="oh-field-error"
                    />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldGroup>
              <Controller<BookingFormValues>
                name="question"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <label className="oh-field-label" htmlFor={field.name}>
                      {t("fieldQuestion")}{" "}
                      <span className="oh-field-label-opt">
                        {t("fieldQuestionOptional")}
                      </span>
                    </label>
                    <textarea
                      {...field}
                      id={field.name}
                      rows={3}
                      maxLength={500}
                      placeholder={t("fieldQuestionPlaceholder")}
                      aria-invalid={fieldState.invalid}
                      className="oh-textarea"
                    />
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="oh-field-error"
                    />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
          <Button
            type="submit"
            variant="oh"
            size="oh"
            disabled={book.isPending}
            className="oh-book-submit"
          >
            {book.isPending ? t("submitBookPending") : t("submitBook")}
          </Button>
          {book.error ? (
            <p className="oh-field-error" role="alert">
              {book.error.message}
            </p>
          ) : null}
        </FieldGroup>
      </form>
    </FormProvider>
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
            {oldStart ? fmtSlot(oldStart) : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="oh-eyebrow">{t("rescheduleToLabel")}</span>
          <span className="font-[family-name:var(--oh-mono)] text-[14px] font-bold tabular-nums">
            {fmtSlot(newStart)}
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

function fmtSlot(d: Date): string {
  const day = d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}
