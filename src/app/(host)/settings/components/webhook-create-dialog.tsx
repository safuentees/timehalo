"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useCreateWebhook } from "@/lib/mutations/use-create-webhook";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import {
  RESPONSIVE_MODAL_BODY_CLASS,
  ResponsiveModal,
  ResponsiveModalBody,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";

// Webhook subscription create dialog. Two states inside one modal:
//
//   1. "form"   — URL field + events checkbox group. Submit hits
//                 `webhooks.create` with the workspace slug.
//   2. "secret" — the freshly-minted HMAC signing secret + a copy
//                 button. Returned EXACTLY ONCE by the procedure (the
//                 .list response intentionally omits `secret` so a
//                 leaked DB snapshot doesn't reveal it). This view is
//                 the user's last chance to grab the value.
//
// Pattern reference: `api-key-create-dialog.tsx` — same "create then
// immediately reveal once" flow. Webhook secret is hex-encoded 32
// bytes; api key tokens are `oh_<24>` — different shapes, same UX.

const schema = z.object({
  subscriberUrl: z
    .string()
    .trim()
    .url("Must be a valid URL"),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pick at least one event"),
});
type Values = z.infer<typeof schema>;

type Props = {
  /** Workspace slug the new subscription will belong to. */
  slug: string;
};

export function WebhookCreateDialog({ slug }: Props) {
  const t = useTranslations("Webhooks");
  const [open, setOpen] = useState(false);
  // Secret returned exactly once. Cleared when the dialog closes so
  // reopening starts back at the form view.
  const [secret, setSecret] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSecret(null);
  }

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange}>
      <ResponsiveModalTrigger asChild id="oh-create-webhook-trigger">
        <Button variant="oh" size="oh">
          {t("createButton")}
        </Button>
      </ResponsiveModalTrigger>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {secret ? t("createdTitle") : t("createTitle")}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>
        {secret ? (
          <RevealedSecret
            secret={secret}
            onClose={() => handleOpenChange(false)}
          />
        ) : (
          <CreateForm
            slug={slug}
            onCreated={(value) => setSecret(value)}
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
  onCreated: (secret: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Webhooks");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { subscriberUrl: "", events: [] },
    mode: "onBlur",
  });

  const createWebhook = useCreateWebhook({
    onSuccess: (data) => {
      onCreated(data.secret);
    },
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(async (v) => {
          await createWebhook.mutateAsync({
            slug,
            subscriberUrl: v.subscriberUrl,
            events: v.events,
          });
        })}
        className={RESPONSIVE_MODAL_BODY_CLASS}
      >
        <p className="oh-description">{t("createDescription")}</p>
        <Controller<Values>
          name="subscriberUrl"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <label className="oh-legend" htmlFor={field.name}>
                {t("urlLabel")}
              </label>
              <input
                {...field}
                id={field.name}
                type="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("urlPlaceholder")}
                aria-invalid={fieldState.invalid}
                className="oh-input mt-2 font-[family-name:var(--oh-mono)] text-[14px]"
              />
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
                className="oh-field-error"
              />
            </Field>
          )}
        />
        <Controller<Values>
          name="events"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <p id="webhook-events-label" className="oh-legend">
                {t("eventsLabel")}
              </p>
              <p className="oh-description mt-2">{t("eventsDescription")}</p>
              <fieldset
                aria-labelledby="webhook-events-label"
                className="mt-3 grid grid-cols-1 gap-0 border-2 border-oh-line-strong"
              >
                {WEBHOOK_EVENTS.map((event) => {
                  const checked = (field.value as WebhookEvent[]).includes(
                    event,
                  );
                  return (
                    <label
                      key={event}
                      className={[
                        "flex cursor-pointer items-center gap-3 px-4 py-3",
                        "font-[family-name:var(--oh-mono)] text-[12px] font-extrabold tracking-[1.5px] uppercase",
                        "transition-colors duration-150 ease-oh",
                        "border-t-2 border-oh-line-strong first:border-t-0",
                        checked
                          ? "bg-oh-content text-oh-bg"
                          : "bg-oh-bg text-oh-content hover:bg-oh-tint",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={(e) => {
                          const current = field.value as WebhookEvent[];
                          field.onChange(
                            e.target.checked
                              ? [...current, event]
                              : current.filter((s) => s !== event),
                          );
                        }}
                      />
                      <span
                        aria-hidden
                        className={[
                          "inline-flex size-4 shrink-0 items-center justify-center border-2",
                          checked
                            ? "border-oh-bg bg-oh-bg text-oh-content"
                            : "border-oh-line-strong bg-oh-bg",
                        ].join(" ")}
                      >
                        {checked ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <span className="truncate">{event}</span>
                    </label>
                  );
                })}
              </fieldset>
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
            disabled={createWebhook.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="oh"
            size="oh"
            disabled={createWebhook.isPending}
          >
            {createWebhook.isPending ? t("creating") : t("create")}
          </Button>
        </ResponsiveModalFooter>
      </form>
    </FormProvider>
  );
}

function RevealedSecret({
  secret,
  onClose,
}: {
  secret: string;
  onClose: () => void;
}) {
  const t = useTranslations("Webhooks");
  const [copied, setCopied] = useState(false);

  // Reset the "Copied" pill after 2s. Cleanup cancels the timer when
  // the user copies again before the original timer fires.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Clipboard API blocked (insecure context, denied permission).
      // Surface nothing — the value is still visible in the input;
      // user can select-all / copy manually.
    }
  }

  return (
    <ResponsiveModalBody>
      <p className="oh-description">{t("revealedDescription")}</p>
      <Field>
        <label htmlFor="webhook-secret" className="oh-legend">
          {t("secretLabel")}
        </label>
        <div className="mt-2 flex flex-wrap items-stretch gap-2">
          <input
            id="webhook-secret"
            type="text"
            value={secret}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="oh-input flex-1 min-w-[220px] font-[family-name:var(--oh-mono)] text-[13px]"
          />
          <Button type="button" variant="oh" size="oh" onClick={handleCopy}>
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
      <ResponsiveModalFooter>
        <Button type="button" variant="ohGhost" size="oh" onClick={onClose}>
          {t("done")}
        </Button>
      </ResponsiveModalFooter>
    </ResponsiveModalBody>
  );
}
