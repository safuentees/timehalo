"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowRightIcon, PencilIcon } from "lucide-react";
import type { Slot } from "@/lib/availability";

type Props = {
  selectedDate: Date | undefined;
  selectedSlot: Slot | undefined;
  onClick: () => void;
};

/**
 * Airbnb-style inline trigger card. Three states:
 *   empty → PICK A DATE
 *   date  → {DATE} (top) / PICK A TIME (bottom)
 *   full  → {DATE} (top) / {TIME} (bottom, with ✎)
 *
 * Tapping always calls `onClick`; the parent decides which drawer phase
 * to open based on the current selection state.
 *
 * B.PT91 — visible labels + aria threaded through `useTranslations`.
 * Uppercase styling is preserved by the `oh-trigger-card-line-*` CSS
 * classes (text-transform: uppercase) so the message catalog stores
 * the natural-case copy and presentation owns the visual rhythm —
 * cleaner for translators (Spanish caps look different from English).
 */
export function TriggerCard({ selectedDate, selectedSlot, onClick }: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const hasDate = !!selectedDate;
  const hasSlot = !!selectedSlot;
  const variant: "empty" | "date" | "full" = !hasDate
    ? "empty"
    : !hasSlot
      ? "date"
      : "full";

  // Locale-aware formatting via next-intl's useFormatter (honors the
  // `oh_locale` cookie). Pre-B.PT101 these called `toLocaleDateString`
  // with `undefined` locale, which silently fell back to the BROWSER
  // locale and ignored the user's app-locale choice.
  const dateLabel = selectedDate
    ? format
        .dateTime(selectedDate, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
        .toUpperCase()
    : "";
  const timeLabel = selectedSlot
    ? format
        .dateTime(new Date(selectedSlot.start), {
          hour: "numeric",
          minute: "2-digit",
        })
        .toUpperCase()
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`oh-trigger-card oh-trigger-card--${variant}`}
      aria-label={
        variant === "empty"
          ? t("triggerEmptyAria")
          : variant === "date"
            ? t("triggerDateSelectedAria", { date: dateLabel })
            : t("triggerFullAria", { date: dateLabel, time: timeLabel })
      }
    >
      <span className="oh-trigger-card-body" aria-live="polite">
        {variant === "empty" ? (
          <span className="oh-trigger-card-line-top">{t("triggerEmpty")}</span>
        ) : variant === "date" ? (
          <>
            <span className="oh-trigger-card-line-top">{dateLabel}</span>
            <span className="oh-trigger-card-line-bottom">
              {t("triggerPickTime")}
            </span>
          </>
        ) : (
          <>
            <span className="oh-trigger-card-line-top">{dateLabel}</span>
            <span className="oh-trigger-card-line-bottom oh-trigger-card-time">
              {timeLabel}
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
