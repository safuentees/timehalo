"use client";

import { useTranslations } from "next-intl";
import { ArrowRightIcon, PencilIcon } from "lucide-react";
import type { Slot } from "@/lib/availability";

type Props = {
  selectedDate: Date | undefined;
  selectedSlot: Slot | undefined;
  onClick: () => void;
};

export function TriggerCard({ selectedDate, selectedSlot, onClick }: Props) {
  const t = useTranslations("BookingCalendar");
  const hasDate = !!selectedDate;
  const hasSlot = !!selectedSlot;
  const variant: "empty" | "date" | "full" = !hasDate
    ? "empty"
    : !hasSlot
      ? "date"
      : "full";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`oh-trigger-card oh-trigger-card--${variant}`}
      aria-label={
        variant === "empty"
          ? t("triggerEmptyAria")
          : variant === "date"
            ? t("triggerDateSelectedAria", { date: fmtDate(selectedDate!) })
            : t("triggerFullAria", {
                date: fmtDate(selectedDate!),
                time: fmtTime(new Date(selectedSlot!.start)),
              })
      }
    >
      <span className="oh-trigger-card-body" aria-live="polite">
        {variant === "empty" ? (
          <span className="oh-trigger-card-line-top">{t("triggerEmpty")}</span>
        ) : variant === "date" ? (
          <>
            <span className="oh-trigger-card-line-top">
              {fmtDate(selectedDate!)}
            </span>
            <span className="oh-trigger-card-line-bottom">
              {t("triggerPickTime")}
            </span>
          </>
        ) : (
          <>
            <span className="oh-trigger-card-line-top">
              {fmtDate(selectedDate!)}
            </span>
            <span className="oh-trigger-card-line-bottom oh-trigger-card-time">
              {fmtTime(new Date(selectedSlot!.start))}
            </span>
          </>
        )}
      </span>
      <span className="oh-trigger-card-glyph" aria-hidden>
        {variant === "full" ? <PencilIcon /> : <ArrowRightIcon />}
      </span>
    </button>
  );
}

function fmtDate(d: Date): string {
  return d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

function fmtTime(d: Date): string {
  return d
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
}
