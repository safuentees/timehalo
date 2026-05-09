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

// Public-profile bio editor. Self-contained section — owns its own
// <form>, RHF instance, and <InlineFormSave>. Per
// `dashboard-forms.md` *Hub-page sub-section chrome*: each
// independent sub-section commits via its own inline Save (matching
// /settings/general's per-section pattern), never a shared form.
//
// Cribbed from cal.com's `apps/web/components/settings/.../UserProfile`
// — same shape (textarea + char counter + Save below) — but adapted
// to this project's brutalist `<FieldSet>` / `<FieldLegend>` chrome
// and `oh-input oh-textarea` styling.
//
// Edge cases covered:
//   - Empty bio (whitespace-only or literal "") → server treats as
//     null (clear). The procedure does the trim/null-collapse, so the
//     client just submits the raw value.
//   - 500-char cap enforced both in zod (form-level error) AND
//     `maxLength` on the textarea (browser-level prevention) so the
//     user gets immediate feedback before zod's resolver fires.
//   - Char counter flips destructive color past 500 (only reachable
//     if a paste bypasses maxLength on legacy browsers — defensive).

const BIO_MAX = 500;

const formSchema = z.object({
  bio: z.string().max(BIO_MAX, "500 characters max"),
});
type FormValues = z.infer<typeof formSchema>;

export function BioFields() {
  const t = useTranslations("Profile");
  const { data: me } = trpc.users.me.useQuery();

  // Seed the textarea from `me.bio` if set; otherwise empty (cal.com
  // does NOT seed a placeholder default — the bio field starts blank
  // and the placeholder attribute supplies the "tell visitors..."
  // hint copy. We follow that convention; a seeded default would have
  // to be deleted before the user could write their own copy).
  const values = useMemo<FormValues>(
    () => ({ bio: me?.bio ?? "" }),
    [me],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values,
    resetOptions: { keepDirtyValues: true },
    // onChange so the char counter + max-length error update live as
    // the user types, matching cal.com's bio editor behavior.
    mode: "onChange",
  });

  const setBio = useSetBio();

  async function onSubmit(v: FormValues) {
    // The server's `setBio` procedure trims + collapses whitespace-only
    // input to null; we send the raw string and let the procedure
    // canonicalize. After the mutation resolves, the global
    // invalidation in `src/trpc/hooks.ts` refetches `users.me` and
    // RHF's `values` re-seeds with the canonical stored bio.
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

// Live char counter — `useWatch` re-renders only this component when
// the bio value changes, keeping the surrounding form free of
// avoidable re-renders.
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
