"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Controller,
  FormProvider,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetBio } from "@/lib/mutations/use-set-bio";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { InlineFormSave } from "@/components/oh/inline-form-save";

const BIO_MAX = 500;

const formSchema = z.object({
  bio: z.string().max(BIO_MAX, "500 characters max"),
});
type FormValues = z.infer<typeof formSchema>;

export function BioFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({ bio: me?.bio ?? "" }),
    [me],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onChange",
  });

  const setBio = useSetBio();

  async function onSubmit(v: FormValues) {
    await setBio.mutateAsync({ bio: v.bio });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend className="oh-legend opacity-100">
              {t("bioLegend")}
            </FieldLegend>
            <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
              {t("bioDescription")}
            </FieldDescription>
            <FieldGroup>
              <Controller<FormValues>
                name="bio"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <textarea
                      {...field}
                      id={field.name}
                      placeholder={t("bioPlaceholder")}
                      maxLength={BIO_MAX}
                      rows={4}
                      autoCapitalize="sentences"
                      autoCorrect="on"
                      spellCheck
                      aria-invalid={fieldState.invalid}
                      className="oh-input oh-textarea mt-3 text-[14px]"
                    />
                    <BioCharCount />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
        <InlineFormSave
          isPending={setBio.isPending}
          isDirty={form.formState.isDirty}
          isInvalid={!form.formState.isValid}
          labels={{
            save: t("saveLabel"),
            saving: t("savingLabel"),
            saved: t("savedLabel"),
          }}
        />
      </form>
    </FormProvider>
  );
}

function BioCharCount() {
  const t = useTranslations("Profile");
  const value = useWatch<FormValues>({ name: "bio" }) ?? "";
  const isOver = value.length > BIO_MAX;
  return (
    <p
      className={`mt-1 text-[12px] leading-[1.5] tabular-nums ${
        isOver
          ? "text-[color:var(--destructive)]"
          : "text-[color:var(--oh-content-muted)]"
      }`}
      aria-live="polite"
    >
      {t("bioCharCount", { count: value.length, max: BIO_MAX })}
    </p>
  );
}
