"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateWorkspace } from "@/lib/mutations/use-update-workspace";
import { Field, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  WORKSPACE_SLUG_MIN,
  WORKSPACE_SLUG_MAX,
  workspaceSlugSchema,
} from "@/lib/workspaces";
import { SectionHeader } from "@/components/brutalist/section-header";

// General section — rename + slug change. One atomic form so the
// caller submits both fields together; either field may stay empty
// (no-op for that field). After a slug change succeeds we
// router.replace to the new path so the URL stays consistent with
// the new identity.
//
// CONFLICT (duplicate slug) is caught inline via setError on the
// slug field — the mutation hook suppresses its toast for that one
// code so the form-level message is the only feedback.

type FormShape = { name: string; slug: string };

export function GeneralSection({
  slug,
  name,
  canEdit,
}: {
  slug: string;
  name: string;
  canEdit: boolean;
}) {
  const t = useTranslations("WorkspaceSettings");
  const router = useRouter();

  const schema = z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(60),
    slug: workspaceSlugSchema,
  });

  const values = useMemo<FormShape>(
    () => ({ name, slug }),
    [name, slug],
  );

  const form = useForm<FormShape>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const updateWorkspace = useUpdateWorkspace({
    onSuccess: async (data) => {
      form.reset({ name: data.name, slug: data.slug });
      if (data.slug !== slug) {
        // Slug changed — the current route's slug param is stale.
        // router.replace (not push) so back-button doesn't return
        // to the now-404 old path.
        router.replace(`/workspaces/${data.slug}/settings`);
      }
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        form.setError("slug", {
          type: "server",
          message: t("slugTaken"),
        });
      }
    },
  });

  async function onSubmit(v: FormShape) {
    const patch: { slug: string; name?: string; newSlug?: string } = {
      slug,
    };
    if (v.name !== name) patch.name = v.name;
    if (v.slug !== slug) patch.newSlug = v.slug;
    if (patch.name === undefined && patch.newSlug === undefined) return;
    await updateWorkspace.mutateAsync(patch);
  }

  const isPending = updateWorkspace.isPending;
  const isDirty = form.formState.isDirty;

  return (
    <section aria-labelledby="general-legend">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <SectionHeader
            legendId="general-legend"
            legend={t("generalLegend")}
            description={t("generalDescription")}
          />

          <div className="mt-5 flex flex-col gap-4">
            <Controller<FormShape>
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <label htmlFor={field.name} className="bru-legend">
                    {t("nameLabel")}
                  </label>
                  <input
                    {...field}
                    id={field.name}
                    type="text"
                    placeholder={t("namePlaceholder")}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={!canEdit || isPending}
                    aria-invalid={fieldState.invalid}
                    className="bru-input mt-2 w-full text-[14px]"
                  />
                  <FieldError
                    errors={
                      fieldState.error ? [fieldState.error] : undefined
                    }
                    className="bru-field-error"
                  />
                </Field>
              )}
            />

            <Controller<FormShape>
              name="slug"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <label htmlFor={field.name} className="bru-legend">
                    {t("slugLabel")}
                  </label>
                  <input
                    {...field}
                    id={field.name}
                    type="text"
                    placeholder={t("slugPlaceholder")}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    minLength={WORKSPACE_SLUG_MIN}
                    maxLength={WORKSPACE_SLUG_MAX}
                    disabled={!canEdit || isPending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={`${field.name}-hint`}
                    className="bru-input mt-2 w-full font-[family-name:var(--oh-mono)] text-[13px] tracking-tight"
                  />
                  <p
                    id={`${field.name}-hint`}
                    className="bru-eyebrow mt-2 opacity-55"
                  >
                    {t("slugHint")}
                  </p>
                  <FieldError
                    errors={
                      fieldState.error ? [fieldState.error] : undefined
                    }
                    className="bru-field-error"
                  />
                </Field>
              )}
            />
          </div>

          {canEdit ? (
            <div className="mt-5 flex justify-end">
              <Button
                type="submit"
                variant="brutalist"
                size="brutalist"
                disabled={isPending || !isDirty}
              >
                {isPending
                  ? t("saving")
                  : isDirty
                    ? t("save")
                    : t("saved")}
              </Button>
            </div>
          ) : null}
        </form>
      </FormProvider>
    </section>
  );
}
