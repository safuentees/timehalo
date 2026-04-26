"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useDeleteAccount } from "@/lib/mutations/use-delete-account";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";

// Typed-email confirmation pattern — borrowed from rallly's
// /apps/web/src/app/[locale]/(space)/settings/profile/delete-account-dialog.tsx.
// The user must type their account email exactly before the
// destructive button enables. Defends against muscle-memory clicks
// and accidental "yes I'm sure" routine.

export function DeleteAccountDialog() {
  const t = useTranslations("DangerZone");
  const [open, setOpen] = useState(false);
  const { data: me } = trpc.users.me.useQuery();

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild>
        <Button
          variant="outline"
          size="brutalist"
          className="bru-danger-trigger"
        >
          {t("deleteAccountButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {t("deleteAccountTitle")}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <DeleteForm
          email={me?.email ?? null}
          handle={me?.handle ?? null}
          onCancel={() => setOpen(false)}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function DeleteForm({
  email,
  handle,
  onCancel,
}: {
  email: string | null;
  handle: string | null;
  onCancel: () => void;
}) {
  const t = useTranslations("DangerZone");
  const schema = z.object({
    confirmEmail: z.string().refine((v) => v === email, {
      message: t("emailMismatch"),
    }),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { confirmEmail: "" },
    mode: "onChange",
  });

  const deleteAccount = useDeleteAccount({
    onSuccess: async () => {
      // Clear the session cookie and bounce to the public root.
      // signOut redirects internally; the browser handles the rest.
      await signOut({ callbackUrl: "/" });
    },
  });

  if (!email) {
    return (
      <div className="px-5 pb-6 text-[13px] opacity-65">
        Loading account…
      </div>
    );
  }

  const isPending = deleteAccount.isPending;
  const isValid = form.formState.isValid;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async () => {
          await deleteAccount.mutateAsync();
        })}
        className="px-5 pb-6 flex flex-col gap-5"
      >
        <p className="text-[14px] leading-[1.55] opacity-80">
          {t.rich("dialogIntro", {
            handle: () => (
              <strong>@{handle ?? "your handle"}</strong>
            ),
          })}
        </p>
        <p className="text-[13px] leading-[1.5] opacity-65">
          {t.rich("dialogTypeEmail", {
            email,
            code: (chunks) => (
              <code className="font-[family-name:var(--bru-mono)] text-[12px]">
                {chunks}
              </code>
            ),
          })}
        </p>
        <Controller<Values>
          name="confirmEmail"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <BrutalistInputGroup>
                <BrutalistInputGroupInput
                  {...field}
                  id={field.name}
                  type="email"
                  placeholder={email}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  aria-invalid={fieldState.invalid}
                />
                <BrutalistInputGroupAddon align="inline-start">
                  <BrutalistInputGroupText>
                    {t("emailFieldLabel")}
                  </BrutalistInputGroupText>
                </BrutalistInputGroupAddon>
              </BrutalistInputGroup>
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="brutalist"
            onClick={onCancel}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            disabled={!isValid || isPending}
            className="bru-danger-confirm"
          >
            {isPending ? t("deleting") : t("confirm")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
