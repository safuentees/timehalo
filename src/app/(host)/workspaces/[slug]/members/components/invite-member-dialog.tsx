"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusIcon, MinusIcon } from "lucide-react";
import { useInviteMany } from "@/lib/mutations/use-invite-many";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { OhSelect } from "@/components/oh/oh-select";
import {
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";

const ROLE_BASE = ["MEMBER", "VIEWER"] as const;
const ROLE_OWNER_TIER = ["ADMIN", ...ROLE_BASE] as const;

const inviteRowSchema = z.object({
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

const schema = z.object({
  invites: z
    .array(inviteRowSchema)
    .min(1, "Add at least one invite")
    .max(50, "At most 50 invites per batch"),
});

type FormValues = z.infer<typeof schema>;

const defaultRow = (): z.infer<typeof inviteRowSchema> => ({
  email: "",
  role: "MEMBER",
});

const defaultValues = (): FormValues => ({
  invites: [defaultRow()],
});

export function InviteMemberDialog({
  slug,
  canGrantAdmin,
}: {
  slug: string;
  canGrantAdmin: boolean;
}) {
  const t = useTranslations("Members");
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild>
        <Button variant="oh" size="oh">
          {t("inviteButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{t("inviteTitle")}</ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <InviteForm
          slug={slug}
          canGrantAdmin={canGrantAdmin}
          onDone={() => setOpen(false)}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function InviteForm({
  slug,
  canGrantAdmin,
  onDone,
}: {
  slug: string;
  canGrantAdmin: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("Members");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(),
    mode: "onBlur",
  });
  const { fields, append, remove } = useFieldArray({
    name: "invites",
    control: form.control,
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const inviteMany = useInviteMany({
    onSuccess: () => {
      form.reset(defaultValues());
      setServerError(null);
      onDone();
    },
    onError: (error) => {
      if (error.data?.code === "FORBIDDEN") {
        setServerError(error.message);
      }
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    await inviteMany.mutateAsync({
      slug,
      invites: values.invites,
    });
  }

  const isPending = inviteMany.isPending;
  const roleOptions = canGrantAdmin ? ROLE_OWNER_TIER : ROLE_BASE;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="flex items-end gap-2"
            >
              <Controller<FormValues, `invites.${number}.email`>
                name={`invites.${index}.email`}
                render={({ field: emailField, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid}
                    className="flex-1 min-w-0"
                  >
                    {index === 0 ? (
                      <FieldLabel htmlFor={emailField.name}>
                        {t("emailLabel")}
                      </FieldLabel>
                    ) : null}
                    <input
                      {...emailField}
                      id={emailField.name}
                      type="email"
                      placeholder={t("emailPlaceholder")}
                      aria-invalid={fieldState.invalid}
                      className="oh-input mt-3 font-[family-name:var(--oh-mono)] text-[14px]"
                    />
                    <FieldError
                      errors={
                        fieldState.error ? [fieldState.error] : undefined
                      }
                      className="oh-field-error"
                    />
                  </Field>
                )}
              />

              <Controller<FormValues, `invites.${number}.role`>
                name={`invites.${index}.role`}
                render={({ field: roleField }) => (
                  <Field className="w-[120px] shrink-0">
                    {index === 0 ? (
                      <FieldLabel htmlFor={roleField.name}>
                        {t("roleLabel")}
                      </FieldLabel>
                    ) : null}
                    <div className="mt-3">
                      <OhSelect
                        {...roleField}
                        id={roleField.name}
                        className="font-[family-name:var(--oh-mono)] text-[12px]"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {t(`role_${r}`)}
                          </option>
                        ))}
                      </OhSelect>
                    </div>
                  </Field>
                )}
              />

              {index > 0 ? (
                <Button
                  type="button"
                  variant="ohGhost"
                  size="ohIcon"
                  onClick={() => remove(index)}
                  aria-label={t("removeInviteRow")}
                  disabled={isPending}
                >
                  <MinusIcon
                    aria-hidden
                    strokeWidth={1.5}
                    className="size-4"
                  />
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="ohGhost"
          size="oh"
          onClick={() => append(defaultRow())}
          disabled={isPending || fields.length >= 50}
          className="self-start"
        >
          <PlusIcon
            aria-hidden
            strokeWidth={1.5}
            className="size-4"
          />
          {t("addInviteRow")}
        </Button>

        {serverError ? (
          <p className="oh-description text-[color:var(--oh-content-muted)]">
            {serverError}
          </p>
        ) : null}

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
            {isPending
              ? t("sending")
              : fields.length === 1
                ? t("sendInvite")
                : t("sendInvites", { count: fields.length })}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
