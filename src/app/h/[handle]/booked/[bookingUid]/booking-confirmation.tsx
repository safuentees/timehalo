"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
} from "../../components/handle-morph-parts";
import { HandleMorphCard } from "../../components/handle-morph-card";
import { BookingReceiptContent } from "./booking-receipt-content";

export type BookingConfirmationBooking = {
  publicUid: string;
  slotStart: Date | string;
  slotEnd: Date | string;
  host: {
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

type BookingConfirmationProps = {
  booking: BookingConfirmationBooking;
};

export function BookingConfirmation({ booking }: BookingConfirmationProps) {
  const t = useTranslations("BookingConfirmation");
  const format = useFormatter();

  const startDate = new Date(booking.slotStart);
  const titleDate = format.dateTime(startDate, {
    month: "short",
    day: "numeric",
  });
  const titleTime = format.dateTime(startDate, {
    hour: "numeric",
    minute: "2-digit",
  });
  const titleText = t("badgeBookedOn", {
    date: titleDate,
    time: titleTime,
  });

  return (
    <div
      role="region"
      aria-label={t("badgeBooked")}
      className="flex min-h-dvh items-center justify-center bg-oh-bg-muted p-4 sm:p-8"
    >
      <HandleMorphCard
        style={{
          ...HANDLE_CARD_RADIUS_STYLE,
        }}
        className="min-h-[min(calc(100dvw-32px),450px)] w-[min(calc(100dvw-32px),450px)] max-w-none overflow-hidden p-[15px] sm:min-h-[min(calc(100dvw-64px),450px)] sm:w-[min(calc(100dvw-64px),450px)]"
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-[15px]">
          <div className="relative z-30 grid h-7 shrink-0 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-2">
            <span aria-hidden />
            <span className="justify-self-center truncate font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]">
              {titleText}
            </span>
            <span aria-hidden />
          </div>
          <div
            style={{
              ...HANDLE_SLOT_LIST_RADIUS_STYLE,
              boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
            }}
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF] dark:bg-[#272727]"
          >
            <BookingReceiptContent booking={booking} />
          </div>
        </div>
      </HandleMorphCard>
    </div>
  );
}
