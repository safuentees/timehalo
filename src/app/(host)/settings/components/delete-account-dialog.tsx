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
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";

export function DeleteAccountDialog() {
  const t = useTranslations("DangerZone");
  const [open, setOpen] = useState(false);
  const { data: me } = trpc.users.me.useQuery();

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalTrigger asChild id="oh-delete-account-trigger">
        <Button variant="ohGhost" size="oh">
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
      await signOut({ callbackUrl: "/" });
    },
  });

  if (!email) {
    return (
      <div className="px-5 pb-6 text-[13px] opacity-65">
        {t("loadingAccount")}
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
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <p className="text-[14px] leading-[1.55] opacity-80">
          {t.rich("dialogIntro", {
            handle: () => (
              <strong>@{handle ?? t("handleFallback")}</strong>
            ),
          })}
        </p>
        <p className="oh-description">
          {t.rich("dialogTypeEmail", {
            email,
            code: (chunks) => (
              <code className="font-[family-name:var(--oh-mono)] text-[12px]">
                {chunks}
              </code>
            ),
          })}
        </p>
        <Controller<Values>
          name="confirmEmail"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <OhInputGroup>
                <OhInputGroupInput
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
                <OhInputGroupAddon align="inline-start">
                  <OhInputGroupText>
                    {t("emailFieldLabel")}
                  </OhInputGroupText>
                </OhInputGroupAddon>
              </OhInputGroup>
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
            onClick={onCancel}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="oh"
            size="oh"
            disabled={!isValid || isPending}
          >
            {isPending ? t("deleting") : t("confirm")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
