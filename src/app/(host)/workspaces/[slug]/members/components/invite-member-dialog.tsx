"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useInviteMember } from "@/lib/mutations/use-invite-member";
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

// Invite dialog. Owner can grant ADMIN; admins are restricted to
// MEMBER/VIEWER (the server enforces this — we just keep the
// dropdown options narrower so the user doesn't pick a role they'd
// be rejected on).
//
// FORBIDDEN from the server (e.g. somehow trying to invite an OWNER)
// surfaces inline via form.setError on the role field.

const ROLE_BASE = ["MEMBER", "VIEWER"] as const;
const ROLE_OWNER_TIER = ["ADMIN", ...ROLE_BASE] as const;

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = { email: "", role: "MEMBER" };

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
        <Button variant="brutalist" size="brutalist">
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
    defaultValues,
    mode: "onBlur",
  });

  const invite = useInviteMember({
    onSuccess: () => {
      form.reset(defaultValues);
      onDone();
    },
    onError: (error) => {
      if (error.data?.code === "FORBIDDEN") {
        form.setError("role", { type: "server", message: error.message });
      }
    },
  });

  async function onSubmit(values: FormValues) {
    await invite.mutateAsync({
      slug,
      email: values.email,
      role: values.role,
    });
  }

  const isPending = invite.isPending;
  const roleOptions = canGrantAdmin ? ROLE_OWNER_TIER : ROLE_BASE;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <Controller<FormValues, "email">
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("emailLabel")}</FieldLabel>
              <input
                {...field}
                id={field.name}
                type="email"
                placeholder={t("emailPlaceholder")}
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

        <Controller<FormValues, "role">
          name="role"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>{t("roleLabel")}</FieldLabel>
              <select
                {...field}
                id={field.name}
                aria-invalid={fieldState.invalid}
                className="bru-input mt-3 font-[family-name:var(--bru-mono)] text-[14px]"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)}
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
            {isPending ? t("sending") : t("sendInvite")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
