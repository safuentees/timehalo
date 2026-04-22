"use client";

import { ArrowRightIcon, PencilIcon } from "lucide-react";
import type { Slot } from "@/lib/availability";

type Props = {
  selectedDate: Date | undefined;
  selectedSlot: Slot | undefined;
  onClick: () => void;
};

export function TriggerCard({ selectedDate, selectedSlot, onClick }: Props) {
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
      className={`bru-trigger-card bru-trigger-card--${variant}`}
      aria-label={
        variant === "empty"
          ? "Pick a date"
          : variant === "date"
            ? `${fmtDate(selectedDate!)} selected, pick a time`
            : `${fmtDate(selectedDate!)} at ${fmtTime(new Date(selectedSlot!.start))}, edit`
      }
    >
      <span className="bru-trigger-card-body" aria-live="polite">
        {variant === "empty" ? (
          <span className="bru-trigger-card-line-top">PICK A DATE</span>
        ) : variant === "date" ? (
          <>
            <span className="bru-trigger-card-line-top">
              {fmtDate(selectedDate!)}
            </span>
            <span className="bru-trigger-card-line-bottom">PICK A TIME</span>
          </>
        ) : (
          <>
            <span className="bru-trigger-card-line-top">
              {fmtDate(selectedDate!)}
            </span>
            <span className="bru-trigger-card-line-bottom bru-trigger-card-time">
              {fmtTime(new Date(selectedSlot!.start))}
            </span>
          </>
        )}
      </span>
      <span className="bru-trigger-card-glyph" aria-hidden>
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
