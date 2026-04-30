"use client";

import { useMemo } from "react";
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

// Public-profile editor. For now: handle only. Phase 2 will add bio +
// FAQ cards (per the OFFICEHOURS-PROJECT-GUIDE user stories).

const schema = z.object({
  handle: handleFieldSchema,
});

type FormValues = z.infer<typeof schema>;

export default function ProfileForm() {
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
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <OhPageShell>
          <OhPageHeader title="Public profile" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="oh-legend opacity-100">
                  Public handle
                </FieldLegend>
                <FieldDescription className="text-[13px] leading-[1.5] opacity-65">
                  The slug visitors use to reach your booking page —
                  officehours.app/h/&lt;handle&gt;.
                </FieldDescription>
                <FieldGroup>
                  <HandleFields />
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </div>
          <InlineFormSave
            isPending={saveHandle.isPending}
            isDirty={form.formState.isDirty}
            labels={{
              save: "Save changes",
              saving: "Saving…",
              saved: "Saved",
            }}
          />
        </OhPageShell>
      </form>
    </FormProvider>
  );
}
