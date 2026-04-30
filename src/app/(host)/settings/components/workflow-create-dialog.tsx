"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateWorkflow } from "@/lib/mutations/use-create-workflow";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import {
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

// Workflow create dialog. Cross-field validation mirrors the
// server: EMAIL_* requires template, WEBHOOK_FIRE requires
// webhookEvent, BEFORE_EVENT uses offsetMinutes.
//
// TRIGGERS / ACTIONS / TEMPLATES are intentionally duplicated from
// the server (`src/trpc/routers/workflows.ts`, `src/lib/workflows.ts`)
// because those modules import prisma + server-only and can't ship
// to the client. Keep both lists in sync when adding a kind.

const TRIGGERS = [
  "BEFORE_EVENT",
  "EVENT_CREATED",
  "EVENT_CANCELLED",
  "EVENT_RESCHEDULED",
] as const;

const ACTIONS = ["EMAIL_VISITOR", "EMAIL_HOST", "WEBHOOK_FIRE"] as const;

const TEMPLATES = [
  "booking-created",
  "booking-cancelled",
  "booking-cancelled-host",
  "booking-rescheduled",
  "booking-reminder",
] as const;

const schema = z
  .object({
    name: z.string().trim().min(1).max(80),
    trigger: z.enum(TRIGGERS),
    offsetMinutes: z
      .number({ message: "Enter a number" })
      .int()
      .min(0)
      .max(7 * 24 * 60),
    action: z.enum(ACTIONS),
    template: z.enum(TEMPLATES).optional(),
    webhookEvent: z.enum(WEBHOOK_EVENTS).optional(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      (v.action === "EMAIL_VISITOR" || v.action === "EMAIL_HOST") &&
      !v.template
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["template"],
        message: "Pick a template",
      });
    }
    if (v.action === "WEBHOOK_FIRE" && !v.webhookEvent) {
      ctx.addIssue({
        code: "custom",
        path: ["webhookEvent"],
        message: "Pick an event",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  name: "",
  trigger: "EVENT_CREATED",
  offsetMinutes: 0,
  action: "EMAIL_VISITOR",
  template: "booking-created",
  webhookEvent: undefined,
  active: true,
};

export function WorkflowCreateDialog() {
  const t = useTranslations("Workflows");
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild>
        <Button variant="brutalist" size="brutalist">
          {t("addButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{t("createTitle")}</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <CreateForm onDone={() => setOpen(false)} />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Workflows");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  const trigger = useWatch({ control: form.control, name: "trigger" });
  const action = useWatch({ control: form.control, name: "action" });
  const isEmailAction = action === "EMAIL_VISITOR" || action === "EMAIL_HOST";
  const isWebhookAction = action === "WEBHOOK_FIRE";
  const showOffset = trigger === "BEFORE_EVENT";

  const create = useCreateWorkflow({
    onSuccess: () => {
      form.reset(defaultValues);
      onDone();
    },
  });

  async function onSubmit(values: FormValues) {
    await create.mutateAsync({
      name: values.name,
      trigger: values.trigger,
      offsetMinutes: showOffset ? values.offsetMinutes : 0,
      action: values.action,
      template: isEmailAction ? values.template : undefined,
      webhookEvent: isWebhookAction ? values.webhookEvent : undefined,
      active: values.active,
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
              <FieldLabel htmlFor={field.name}>{t("fieldName")}</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                aria-invalid={fieldState.invalid}
                className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />

        <Controller<FormValues, "trigger">
          name="trigger"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("fieldTrigger")}</FieldLabel>
              <select
                {...field}
                id={field.name}
                aria-invalid={fieldState.invalid}
                className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
              >
                {TRIGGERS.map((v) => (
                  <option key={v} value={v}>
                    {t(`trigger_${v}`)}
                  </option>
                ))}
              </select>
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />

        {showOffset ? (
          <Controller<FormValues, "offsetMinutes">
            name="offsetMinutes"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("fieldOffset")}</FieldLabel>
                <input
                  id={field.name}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  // Empty input collapses to NaN; coerce so the zod
                  // resolver doesn't trip on it before submit.
                  onChange={(e) => {
                    const next = e.target.valueAsNumber;
                    field.onChange(Number.isFinite(next) ? next : 0);
                  }}
                  type="number"
                  min={0}
                  max={7 * 24 * 60}
                  aria-invalid={fieldState.invalid}
                  className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
                />
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                  className="bru-field-error"
                />
              </Field>
            )}
          />
        ) : null}

        <Controller<FormValues, "action">
          name="action"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("fieldAction")}</FieldLabel>
              <select
                {...field}
                id={field.name}
                aria-invalid={fieldState.invalid}
                className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
              >
                {ACTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`action_${v}`)}
                  </option>
                ))}
              </select>
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />

        {isEmailAction ? (
          <Controller<FormValues, "template">
            name="template"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {t("fieldTemplate")}
                </FieldLabel>
                <select
                  {...field}
                  value={field.value ?? ""}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
                >
                  {TEMPLATES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                  className="bru-field-error"
                />
              </Field>
            )}
          />
        ) : null}

        {isWebhookAction ? (
          <Controller<FormValues, "webhookEvent">
            name="webhookEvent"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>{t("fieldEvent")}</FieldLabel>
                <select
                  {...field}
                  value={field.value ?? ""}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  className="bru-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
                >
                  <option value="">—</option>
                  {WEBHOOK_EVENTS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                  className="bru-field-error"
                />
              </Field>
            )}
          />
        ) : null}

        <Controller<FormValues, "active">
          name="active"
          render={({ field }) => (
            <Field>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  className="size-4 accent-(--oh-ink)"
                />
                <span className="font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-65">
                  {t("fieldActive")}
                </span>
              </label>
            </Field>
          )}
        />

        <ResponsiveModalFooter>
          <Button
            type="button"
            variant="brutalistGhost"
            size="brutalist"
            onClick={onDone}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            disabled={isPending}
          >
            {isPending ? t("creating") : t("create")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="bru-legend">
      {children}
    </label>
  );
}
