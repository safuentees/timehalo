"use client";

import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateEventType } from "@/lib/mutations/use-event-type-mutations";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(60),
  eventTypeSlug: z
    .string()
    .trim()
    .min(1, "Required")
    .max(30, "30 characters max")
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/,
      "Lowercase letters, digits, hyphens",
    ),
  durationMins: z
    .number({ message: "Enter a number" })
    .int()
    .min(5)
    .max(480),
});

type FormValues = z.infer<typeof schema>;

export function EventTypeEditDialog({
  slug,
  eventType,
  open,
  onOpenChange,
}: {
  slug: string;
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMins: number;
  };
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Edit event type</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <EditForm
          slug={slug}
          eventType={eventType}
          onDone={() => onOpenChange(false)}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function EditForm({
  slug,
  eventType,
  onDone,
}: {
  slug: string;
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMins: number;
  };
  onDone: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      name: eventType.name,
      eventTypeSlug: eventType.slug,
      durationMins: eventType.durationMins,
    },
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const update = useUpdateEventType({
    onSuccess: () => onDone(),
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        form.setError("eventTypeSlug", {
          type: "server",
          message: error.message,
        });
      }
    },
  });

  async function onSubmit(values: FormValues) {
    await update.mutateAsync({
      slug,
      eventTypeId: eventType.id,
      name: values.name,
      eventTypeSlug: values.eventTypeSlug,
      durationMins: values.durationMins,
    });
  }

  const isPending = update.isPending;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <Controller<FormValues, "name">
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                aria-invalid={fieldState.invalid}
                className="oh-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="oh-field-error"
              />
            </Field>
          )}
        />

        <Controller<FormValues, "eventTypeSlug">
          name="eventTypeSlug"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                aria-invalid={fieldState.invalid}
                className="oh-input mt-3 font-[family-name:var(--oh-mono)] text-[14px] lowercase"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="oh-field-error"
              />
            </Field>
          )}
        />

        <Controller<FormValues, "durationMins">
          name="durationMins"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Duration (minutes)</FieldLabel>
              <input
                id={field.name}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={field.value}
                onChange={(e) => {
                  const next = e.target.valueAsNumber;
                  field.onChange(Number.isFinite(next) ? next : 15);
                }}
                type="number"
                min={5}
                max={480}
                step={5}
                aria-invalid={fieldState.invalid}
                className="oh-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="oh-field-error"
              />
            </Field>
          )}
        />

        <ResponsiveModalFooter>
          <Button
            type="button"
            variant="outline"
            size="oh"
            onClick={onDone}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="oh"
            size="oh"
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
