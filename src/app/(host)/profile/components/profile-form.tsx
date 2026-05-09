"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetHandle } from "@/lib/mutations/use-set-handle";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { InlineFormSave } from "@/components/oh/inline-form-save";
import {
  HandleFields,
  handleFieldSchema,
  defaultHandle,
} from "./handle-fields";
import { DurationFields } from "./duration-fields";
import { BioFields } from "./bio-fields";

// Public-profile editor. Hub page (B.PT274) — each section owns its
// own commit affordance, matching /settings/general's pattern from
// `dashboard-forms.md` *Hub-page sub-section chrome*.
// • Handle: single-form shape, Save via `<InlineFormSave>`.
// • Durations: server-state per chip, drawer-based commit owned by
//   `<DurationFields>` (no shared form Save).
// Future sections (bio, FAQ cards per OFFICEHOURS-PROJECT-GUIDE) plug
// in below as independent siblings.

const schema = z.object({
  handle: handleFieldSchema,
});

type FormValues = z.infer<typeof schema>;

export default function ProfileForm() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();

  const values = useMemo<FormValues>(
    () => ({ handle: me?.handle ?? defaultHandle }),
    [me],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  });

  const saveHandle = useSetHandle({
    onError: (error) => {
      // CONFLICT = handle taken. Attach to the field so the user sees
      // "taken" inline instead of just in a toast.
      if (error.data?.code === "CONFLICT") {
        form.setError("handle", {
          type: "server",
          message: error.message,
        });
      }
    },
  });

  async function onSubmit(v: FormValues) {
    form.clearErrors("handle");
    await saveHandle.mutateAsync({ handle: v.handle });
  }

  return (
    <FormProvider {...form}>
      <OhPageShell>
        <OhPageHeader title={t("pageTitle")} />
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="oh-legend opacity-100">
                  {t("handleLegend")}
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  {t("handleDescription")}
                </FieldDescription>
                <FieldGroup>
                  <HandleFields currentHandle={me?.handle ?? undefined} />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
          <InlineFormSave
            isPending={saveHandle.isPending}
            isDirty={form.formState.isDirty}
            isInvalid={!form.formState.isValid}
            labels={{
              save: t("saveLabel"),
              saving: t("savingLabel"),
              saved: t("savedLabel"),
            }}
          />
        </form>
        <div className="mt-12">
          <BioFields />
        </div>
        <div className="mt-12">
          <DurationFields />
        </div>
      </OhPageShell>
    </FormProvider>
  );
}
