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

export function HandleFields({ currentHandle }: { currentHandle?: string }) {
  const t = useTranslations("Profile");
  const { setError, clearErrors } = useFormContext<FormShape>();

  const liveValue = useWatch<FormShape>({ name: "handle" }) ?? "";

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
