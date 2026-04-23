"use client";

import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldSet } from "@/components/ui/field";
import { useBookingCreate } from "@/lib/mutations/use-booking-create";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "@/lib/booking-schema";

type Props = {
  handle: string;
  slotStart: string; // ISO
  onBooked: () => void;
};

/**
 * Visitor booking form rendered inside the BookingDrawer. Three fields:
 * name, email, question (optional). On submit, calls `bookings.create`
 * with the pre-selected slotStart passed in from the parent page.
 */
export function BookingForm({ handle, slotStart, onBooked }: Props) {
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { visitorName: "", visitorEmail: "", question: "" },
    mode: "onBlur",
  });

  const book = useBookingCreate({
    onSuccess: () => {
      form.reset();
      onBooked();
    },
  });

  function onSubmit(values: BookingFormValues) {
    book.mutate({
      handle,
      slotStart,
      visitorName: values.visitorName,
      visitorEmail: values.visitorEmail,
      question: values.question,
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
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
