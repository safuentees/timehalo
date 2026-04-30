"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDeleteWorkspace } from "@/lib/mutations/use-delete-workspace";
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
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupInput,
  BrutalistInputGroupText,
} from "@/components/brutalist/brutalist-input-group";
import { SectionHeader } from "@/components/brutalist/section-header";

export function DangerSection({
  slug,
  workspaceSlug,
}: {
  slug: string;
  workspaceSlug: string;
}) {
  const t = useTranslations("WorkspaceSettings");
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="danger-legend">
      <SectionHeader
        legendId="danger-legend"
        legend={t("dangerLegend")}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
      />

      <div className="mt-5 flex justify-end">
        <ResponsiveModal open={open} onOpenChange={setOpen}>
          <ResponsiveModalTrigger asChild>
            <Button variant="brutalistGhost" size="brutalist">
              {t("deleteAction")}
            </Button>
          </ResponsiveModalTrigger>
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>
                {t("deleteConfirmTitle")}
              </ResponsiveModalTitle>
            </ResponsiveModalHeader>
            <DeleteForm
              slug={slug}
              workspaceSlug={workspaceSlug}
              onCancel={() => setOpen(false)}
            />
          </ResponsiveModalContent>
        </ResponsiveModal>
      </div>
    </section>
  );
}

function DeleteForm({
  slug,
  workspaceSlug,
  onCancel,
}: {
  slug: string;
  workspaceSlug: string;
  onCancel: () => void;
}) {
  const t = useTranslations("WorkspaceSettings");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = z.object({
    confirmSlug: z.string().refine((v) => v === workspaceSlug, {
      message: t("slugMismatch"),
    }),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { confirmSlug: "" },
    mode: "onChange",
  });

  const deleteWorkspace = useDeleteWorkspace({
    onSuccess: () => {
      router.replace("/workspaces");
    },
    onError: (error) => {
      if (error.data?.code === "PRECONDITION_FAILED") {
        setServerError(error.message);
      }
    },
  });

  const isPending = deleteWorkspace.isPending;
  const isValid = form.formState.isValid;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async () => {
          setServerError(null);
          await deleteWorkspace.mutateAsync({ slug });
        })}
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <p className="text-[14px] leading-[1.55] opacity-80">
          {t.rich("deleteIntro", {
            slug: () => (
              <strong className="font-[family-name:var(--oh-mono)] text-[13px]">
                {workspaceSlug}
              </strong>
            ),
          })}
        </p>
        <p className="bru-description">
          {t.rich("deleteTypeSlug", {
            slug: workspaceSlug,
            code: (chunks) => (
              <code className="font-[family-name:var(--oh-mono)] text-[12px]">
                {chunks}
              </code>
            ),
          })}
        </p>

        <Controller<Values>
          name="confirmSlug"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <BrutalistInputGroup>
                <BrutalistInputGroupInput
                  {...field}
                  id={field.name}
                  type="text"
                  placeholder={workspaceSlug}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  aria-invalid={fieldState.invalid}
                />
                <BrutalistInputGroupAddon align="inline-start">
                  <BrutalistInputGroupText>
                    {t("slugLabel")}
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

        {serverError ? (
          <p className="bru-description text-[color:var(--oh-content-muted)]">
            {serverError}
          </p>
        ) : null}

        <ResponsiveModalFooter>
          <Button
            type="button"
            variant="brutalistGhost"
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
          >
            {isPending ? t("deleting") : t("deleteAction")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}
