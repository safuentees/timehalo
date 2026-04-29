"use client";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";
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

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="bru-booking-form">
        <FieldGroup>
          <FieldSet>
            <FieldGroup>
              <Controller<BookingFormValues>
                name="visitorName"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <BrutalistInputGroup>
                      <BrutalistInputGroupInput
                        {...field}
                        id={field.name}
                        placeholder="Alex"
                        autoComplete="name"
                        autoCapitalize="words"
                        aria-invalid={fieldState.invalid}
                      />
                      <BrutalistInputGroupAddon align="inline-start">
                        <BrutalistInputGroupText>Name</BrutalistInputGroupText>
                      </BrutalistInputGroupAddon>
                    </BrutalistInputGroup>
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="bru-field-error"
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
                    <BrutalistInputGroup>
                      <BrutalistInputGroupInput
                        {...field}
                        id={field.name}
                        type="email"
                        placeholder="alex@example.com"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={fieldState.invalid}
                      />
                      <BrutalistInputGroupAddon align="inline-start">
                        <BrutalistInputGroupText>Email</BrutalistInputGroupText>
                      </BrutalistInputGroupAddon>
                    </BrutalistInputGroup>
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="bru-field-error"
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
                    <label className="bru-field-label" htmlFor={field.name}>
                      Question{" "}
                      <span className="bru-field-label-opt">(optional)</span>
                    </label>
                    <textarea
                      {...field}
                      id={field.name}
                      rows={3}
                      maxLength={500}
                      placeholder="What would you like to talk about?"
                      aria-invalid={fieldState.invalid}
                      className="bru-textarea"
                    />
                    <FieldError
                      errors={fieldState.error ? [fieldState.error] : undefined}
                      className="bru-field-error"
                    />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            disabled={book.isPending}
            className="bru-book-submit"
          >
            {book.isPending ? "Booking…" : "Confirm booking →"}
          </Button>
          {book.error ? (
            <p className="bru-field-error" role="alert">
              {book.error.message}
            </p>
          ) : null}
        </FieldGroup>
      </form>
    </FormProvider>
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
    <div className="bru-booking-form flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-paper p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="bru-eyebrow opacity-55">From</span>
          <span className="font-[family-name:var(--bru-mono)] text-[13px] tabular-nums opacity-75 line-through">
            {oldStart ? fmtSlot(oldStart) : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="bru-eyebrow">To</span>
          <span className="font-[family-name:var(--bru-mono)] text-[14px] font-bold tabular-nums">
            {fmtSlot(newStart)}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="brutalist"
        size="brutalist"
        disabled={reschedule.isPending}
        className="bru-book-submit"
        onClick={() => {
          reschedule.mutate({
            oldPublicUid,
            newSlotStart: slotStart,
            idempotencyKey,
            visitorTimezone: getBrowserTimezone(),
          });
        }}
      >
        {reschedule.isPending ? "Rescheduling…" : "Confirm reschedule →"}
      </Button>
      {reschedule.error ? (
        <p className="bru-field-error" role="alert">
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
