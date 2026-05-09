"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { z } from "zod";
import { trpc } from "@/trpc/hooks";
import { Field } from "@/components/ui/field";
import {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupInput,
  OhInputGroupText,
} from "@/components/oh/oh-input-group";

// Just the zod shape for the handle piece. The parent form composes this
// with other section schemas into one combined schema.
export const handleFieldSchema = z
  .string()
  .min(3, "3+ characters")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const defaultHandle = "";

type FormShape = { handle: string };

type Availability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error"
  | "current";

const HANDLE_DEBOUNCE_MS = 350;

/**
 * Inline live-availability check on the user's public handle. Cribbed
 * from cal.com's `PremiumTextfield` (apps/web/components/ui/Username
 * Availability/PremiumTextfield.tsx) — debounced query + inline trailing
 * affordance + per-state help copy — but adapted to the borderless-
 * depth chrome the rest of the dashboard uses (paper recess, no
 * contrasting border, paper-soft hairline between prefix and value).
 *
 * `currentHandle` lets us short-circuit the API call when the user
 * types their own existing handle (the `auth.handleAvailability` query
 * looks up by handle and would report `available: false` for the
 * user's own row — correct semantically, wrong UX for the edit case).
 */
export function HandleFields({ currentHandle }: { currentHandle?: string }) {
  const t = useTranslations("Profile");
  const { setError, clearErrors } = useFormContext<FormShape>();

  const liveValue = useWatch<FormShape>({ name: "handle" }) ?? "";

  // Debounce the value so the availability query only fires after the
  // user stops typing for HANDLE_DEBOUNCE_MS. Without this, every
  // keystroke would mint a new query — wasteful + hard to read the
  // "checking…" state. Cal.com uses 600ms; 350ms here because the
  // field is shorter on average (a username, not free-form text).
  const [debouncedValue, setDebouncedValue] = useState(liveValue);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(liveValue), HANDLE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [liveValue]);

  const handleReady = handleFieldSchema.safeParse(debouncedValue).success;
  const isCurrent = !!currentHandle && debouncedValue === currentHandle;

  const availabilityQuery = trpc.auth.handleAvailability.useQuery(
    { handle: debouncedValue },
    {
      enabled: handleReady && !isCurrent,
      retry: false,
    },
  );

  const availability = useMemo<Availability>(() => {
    if (!liveValue) return "idle";
    if (debouncedValue !== liveValue) return "checking";
    if (isCurrent) return "current";
    if (!handleReady) return "invalid";
    if (availabilityQuery.isError) return "error";
    if (availabilityQuery.data) {
      return availabilityQuery.data.available ? "available" : "taken";
    }
    return "checking";
  }, [
    liveValue,
    debouncedValue,
    isCurrent,
    handleReady,
    availabilityQuery.isError,
    availabilityQuery.data,
  ]);

  // Lift availability state into form-level validity via setError.
  // `isValid` (consumed by `<InlineFormSave isInvalid={...}>`) reflects
  // the union of zod errors + this server-side check. CONFLICT from the
  // mutation also pipes through `setError` in `profile-form.tsx`, so
  // the same field error path is reused for both pre-submit ("taken")
  // and submit-time ("CONFLICT") signals.
  useEffect(() => {
    if (availability === "taken") {
      setError("handle", {
        type: "availability",
        message: "handle taken",
      });
    } else if (availability === "error") {
      setError("handle", {
        type: "availability",
        message: "handle check failed",
      });
    } else if (
      availability === "available" ||
      availability === "current" ||
      availability === "idle"
    ) {
      clearErrors("handle");
    }
  }, [availability, setError, clearErrors]);

  return (
    <Controller<FormShape>
      name="handle"
      render={({ field, fieldState }) => {
        const isInvalidUI =
          availability === "taken" || availability === "invalid";
        return (
          <Field data-invalid={isInvalidUI || fieldState.invalid}>
            {/* Shadcn's InputGroup uses CSS `order-first` / `order-last`
                via the addon's `align` prop, so visual order is decoupled
                from DOM order. We put the input first per the project's
                "input before addon in DOM order" convention
                (oh-ui.md *Composition*); the addons render in their
                visual position via flex order. */}
            <OhInputGroup>
              <OhInputGroupInput
                {...field}
                id={field.name}
                placeholder={t("handlePlaceholder")}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={30}
                aria-invalid={isInvalidUI || fieldState.invalid}
                onChange={(e) =>
                  field.onChange(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
              />
              <OhInputGroupAddon align="inline-start">
                <OhInputGroupText>officehours.app/h/</OhInputGroupText>
              </OhInputGroupAddon>
              {/* Trailing addon hidden in the "current" state — the
                  prior "YOURS" badge sat as a cryptic noun next to
                  the input value with no surrounding context (user
                  feedback: "I didn't understand what I meant"). The
                  message moved to the field's help text below as a
                  full sentence with a ✓ icon — same information,
                  language-agnostic visual cue + clear copy. Other
                  states (free / taken / 3+ / !) keep the inline
                  addon because their badges read clearly on their
                  own. */}
              {availability !== "current" ? (
                <OhInputGroupAddon align="inline-end">
                  <AvailabilityBadge state={availability} />
                </OhInputGroupAddon>
              ) : null}
            </OhInputGroup>
            <HandleHelp state={availability} />
          </Field>
        );
      }}
    />
  );
}

function AvailabilityBadge({ state }: { state: Availability }) {
  const t = useTranslations("Profile");
  switch (state) {
    case "checking":
      return (
        <OhInputGroupText className="opacity-55 tracking-[3px]">
          …
        </OhInputGroupText>
      );
    case "available":
      return (
        <OhInputGroupText className="text-emerald-600 dark:text-emerald-400 opacity-100">
          {t("handleAvailabilityFree")}
        </OhInputGroupText>
      );
    // "current" state intentionally renders no inline badge — see
    // the call-site comment + the help-text branch below for the
    // promoted external indicator.
    case "taken":
      return (
        <OhInputGroupText className="text-[color:var(--destructive)] opacity-100">
          {t("handleAvailabilityTaken")}
        </OhInputGroupText>
      );
    case "invalid":
      return (
        <OhInputGroupText className="opacity-55">
          {t("handleAvailabilityInvalid")}
        </OhInputGroupText>
      );
    case "error":
      return (
        <OhInputGroupText className="text-[color:var(--destructive)] opacity-100">
          {t("handleAvailabilityError")}
        </OhInputGroupText>
      );
    default:
      return null;
  }
}

function HandleHelp({ state }: { state: Availability }) {
  const t = useTranslations("Profile");
  const text =
    state === "taken"
      ? t("handleHelpTaken")
      : state === "invalid"
        ? t("handleHelpInvalid")
        : state === "error"
          ? t("handleHelpError")
          : state === "available"
            ? t("handleHelpAvailable")
            : state === "current"
              ? t("handleHelpCurrent")
              : t("handleHelpDefault");
  // "current" state shares the emerald "things look good" tone with
  // "available" — they're both positive, no-action-needed states.
  // Adds a ✓ icon prefix so the cue reads in 50ms regardless of
  // language; combined with the full sentence in the help copy
  // ("This is your current handle.") the user understands the
  // affordance instantly without parsing a cryptic "YOURS" tag
  // inside the input.
  const tone =
    state === "taken" || state === "error"
      ? "text-[color:var(--destructive)]"
      : state === "available" || state === "current"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-[color:var(--oh-content-muted)]";
  return (
    <p
      className={`mt-1 inline-flex items-center gap-1.5 text-[12px] leading-[1.5] ${tone}`}
    >
      {state === "current" ? (
        <CheckIcon
          className="size-3.5 shrink-0"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : null}
      <span>{text}</span>
    </p>
  );
}
