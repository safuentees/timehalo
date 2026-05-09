"use client";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useCreateEventType } from "@/lib/mutations/use-event-type-mutations";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
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

const defaultValues: FormValues = {
  name: "",
  eventTypeSlug: "",
  durationMins: 15,
};

export function EventTypeCreateDialog({ slug }: { slug: string }) {
  const t = useTranslations("EventTypes");
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild id="oh-create-event-type-trigger">
        <Button variant="oh" size="oh">
          {t("addButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{t("createTitle")}</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <CreateForm slug={slug} onDone={() => setOpen(false)} />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function CreateForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const t = useTranslations("EventTypes");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  const create = useCreateEventType({
    onSuccess: () => {
      form.reset(defaultValues);
      onDone();
    },
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
    await create.mutateAsync({
      slug,
      eventTypeSlug: values.eventTypeSlug,
      name: values.name,
      durationMins: values.durationMins,
    });
  }

  const isPending = create.isPending;

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
              <FieldLabel htmlFor={field.name}>{t("nameLabel")}</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                placeholder={t("namePlaceholder")}
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
              <FieldLabel htmlFor={field.name}>{t("slugLabel")}</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                placeholder={t("slugPlaceholder")}
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
              <FieldLabel htmlFor={field.name}>{t("durationLabel")}</FieldLabel>
              <input
                id={field.name}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={
                  Number.isFinite(field.value) ? field.value : ""
                }
                // Empty input → emit NaN; the field reads as truly
                // empty instead of snapping back to 15. Zod resolver
                // catches NaN at submit-time via the `min(5)` rule.
                onChange={(e) => {
                  const next = e.target.valueAsNumber;
                  field.onChange(next);
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
            variant="ohGhost"
            size="oh"
            onClick={onDone}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="oh"
            size="oh"
            disabled={isPending}
          >
            {isPending ? t("submitCreatePending") : t("submitCreate")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
