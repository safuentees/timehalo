"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useCreateApiKey } from "@/lib/mutations/use-create-api-key";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";

const SCOPE_OPTIONS = [
  "workspace.read",
  "workspace.write",
  "members.read",
  "members.write",
  "bookings.read",
  "bookings.write",
  "webhooks.read",
  "webhooks.write",
] as const;
type Scope = (typeof SCOPE_OPTIONS)[number];

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z
    .array(z.enum(SCOPE_OPTIONS))
    .min(1, "Pick at least one scope"),
});
type Values = z.infer<typeof schema>;

type Props = {
  slug: string;
};

export function ApiKeyCreateDialog({ slug }: Props) {
  const t = useTranslations("ApiKeys");
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setToken(null);
  }

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange}>
      <ResponsiveModalTrigger asChild>
        <Button variant="brutalist" size="brutalist">
          {t("createButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {token ? t("createdTitle") : t("createTitle")}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>
        {token ? (
          <RevealedToken
            token={token}
            onClose={() => handleOpenChange(false)}
          />
        ) : (
          <CreateForm
            slug={slug}
            onCreated={(value) => setToken(value)}
            onCancel={() => handleOpenChange(false)}
          />
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function CreateForm({
  slug,
  onCreated,
  onCancel,
}: {
  slug: string;
  onCreated: (token: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("ApiKeys");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", scopes: [] },
    mode: "onBlur",
  });

  const createApiKey = useCreateApiKey({
    onSuccess: (data) => {
      onCreated(data.token);
    },
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async (v) => {
          await createApiKey.mutateAsync({
            slug,
            name: v.name,
            scopes: v.scopes,
          });
        })}
        className="px-5 pb-6 flex flex-col gap-5 sm:px-6"
      >
        <p className="bru-description">
          {t("createDescription")}
        </p>
        <Controller<Values>
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <label className="bru-legend" htmlFor={field.name}>
                {t("nameLabel")}
              </label>
              <input
                {...field}
                id={field.name}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("namePlaceholder")}
                aria-invalid={fieldState.invalid}
                className="bru-input mt-2 font-[family-name:var(--bru-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="bru-field-error"
              />
            </Field>
          )}
        />
        <Controller<Values>
          name="scopes"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <p id="api-key-scopes-label" className="bru-legend">
                {t("scopesLabel")}
              </p>
              <p className="bru-description mt-2">{t("scopesDescription")}</p>
              <fieldset
                aria-labelledby="api-key-scopes-label"
                className="mt-3 grid grid-cols-1 gap-0 border-2 border-bru-line-strong sm:grid-cols-2"
              >
                {SCOPE_OPTIONS.map((scope) => {
                  const checked = (field.value as Scope[]).includes(scope);
                  return (
                    <label
                      key={scope}
                      className={[
                        "flex cursor-pointer items-center gap-3 px-4 py-3",
                        "font-[family-name:var(--bru-mono)] text-[12px] font-extrabold tracking-[1.5px] uppercase",
                        "transition-colors duration-150 ease-bru",
                        "border-t-2 border-bru-line-strong first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l-2",
                        checked
                          ? "bg-bru-content text-bru-bg"
                          : "bg-bru-bg text-bru-content hover:bg-bru-tint",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          const current = field.value as Scope[];
                          field.onChange(
                            e.target.checked
                              ? [...current, scope]
                              : current.filter((s) => s !== scope),
                          );
                        }}
                      />
                      <span
                        aria-hidden
                        className={[
                          "inline-flex size-4 shrink-0 items-center justify-center border-2",
                          checked
                            ? "border-bru-bg bg-bru-bg text-bru-content"
                            : "border-bru-line-strong bg-bru-bg",
                        ].join(" ")}
                      >
                        {checked ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <span className="truncate">{scope}</span>
                    </label>
                  );
                })}
              </fieldset>
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
            variant="brutalistGhost"
            size="brutalist"
            onClick={onCancel}
            disabled={createApiKey.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="brutalist"
            size="brutalist"
            disabled={createApiKey.isPending}
          >
            {createApiKey.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function RevealedToken({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const t = useTranslations("ApiKeys");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
    }
  }

  return (
    <div className="px-5 pb-6 flex flex-col gap-5 sm:px-6">
      <p className="bru-description">{t("revealedDescription")}</p>
      <Field>
        <label htmlFor="api-key-token" className="bru-legend">
          {t("tokenLabel")}
        </label>
        <div className="mt-2 flex flex-wrap items-stretch gap-2">
          <input
            id="api-key-token"
            type="text"
            value={token}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="bru-input flex-1 min-w-[220px] font-[family-name:var(--bru-mono)] text-[13px]"
          />
          <Button
            type="button"
            variant="brutalist"
            size="brutalist"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <CheckIcon />
                {t("copied")}
              </>
            ) : (
              <>
                <CopyIcon />
                {t("copy")}
              </>
            )}
          </Button>
        </div>
      </Field>
      <p className="text-[12px] leading-[1.5] opacity-55">
        {t("revealedHint")}
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="brutalistGhost"
          size="brutalist"
          onClick={onClose}
        >
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
