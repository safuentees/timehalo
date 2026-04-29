"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateWorkspace } from "@/lib/mutations/use-create-workspace";
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
import { WORKSPACE_SLUG_REGEX } from "@/lib/workspaces";

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(60),
  slug: z
    .string()
    .trim()
    .min(3, "3+ characters")
    .max(30, "30 characters max")
    .regex(WORKSPACE_SLUG_REGEX, "Lowercase letters, digits, hyphens"),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = { name: "", slug: "" };

export function WorkspaceCreateDialog({
  open: openProp,
  onOpenChange: setOpenProp,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const t = useTranslations("Workspaces");
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = isControlled
    ? (setOpenProp ?? (() => {}))
    : setInternalOpen;

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {!isControlled ? (
        <ResponsiveModalTrigger asChild>
          <Button variant="brutalist" size="brutalist">
            {t("createButton")}
          </Button>
        </ResponsiveModalTrigger>
      ) : null}
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
  const t = useTranslations("Workspaces");
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  const create = useCreateWorkspace({
    onSuccess: (data) => {
      form.reset(defaultValues);
      onDone();
      router.push(`/workspaces/${data.slug}/members`);
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        form.setError("slug", { type: "server", message: error.message });
      }
    },
  });

  async function onSubmit(values: FormValues) {
    await create.mutateAsync({ name: values.name, slug: values.slug });
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
                className="bru-input mt-3 font-[family-name:var(--bru-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />

        <Controller<FormValues, "slug">
          name="slug"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("slugLabel")}</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="text"
                placeholder={t("slugPlaceholder")}
                aria-invalid={fieldState.invalid}
                className="bru-input mt-3 font-[family-name:var(--bru-mono)] text-[14px] lowercase"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />

        <ResponsiveModalFooter>
          <Button
            type="button"
            variant="outline"
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
