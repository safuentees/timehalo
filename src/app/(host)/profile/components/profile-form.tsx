"use client";

import { useMemo } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { useSetHandle } from "@/lib/mutations/use-set-handle";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import {
  HandleFields,
  handleFieldSchema,
  defaultHandle,
} from "./handle-fields";

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

  const isPending = saveHandle.isPending;
  const isDirty = form.formState.isDirty;

  const mounted = useMounted();
  const buttonDisabled = mounted ? isPending || !isDirty : true;
  const buttonLabel = !mounted
    ? "Saved"
    : isPending
      ? "Saving…"
      : isDirty
        ? "Save changes"
        : "Saved";

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <BrutalistPageShell>
          <BrutalistPageHeader title="Public profile" />
          <div className="mt-8">
            <FieldGroup>
              <FieldSet>
                <FieldLegend className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
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
          <div className="bru-dash-save-spacer" aria-hidden />
        </BrutalistPageShell>

        <div className="bru-dash-save-bar" role="region" aria-label="Save changes">
          <div className="bru-dash-save-bar-inner">
            <Button
              type="submit"
              variant="brutalist"
              size="brutalist"
              className="w-full"
              disabled={buttonDisabled}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
