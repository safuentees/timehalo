"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import type { Slot } from "@/lib/availability";
import { BookingForm } from "./booking-form";

type Props = {
  handle: string;
  slot: Slot | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rescheduleFromUid?: string;
};

export function BookingDrawer({
  handle,
  slot,
  open,
  onOpenChange,
  rescheduleFromUid,
}: Props) {
  const t = useTranslations("BookingCalendar");
  const format = useFormatter();
  const startDate = slot ? new Date(slot.start) : null;
  const isOpen = open && !!slot;
  const isReschedule = Boolean(rescheduleFromUid);
  const slotLabel = startDate
    ? `${format
        .dateTime(startDate, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
        .toUpperCase()} ${format.dateTime(startDate, {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";

  return (
    <ResponsiveModal open={isOpen} onOpenChange={onOpenChange} nested>
      <ResponsiveModalContent mobileClassName="oh-drawer-content-nested">
        <ResponsiveModalHeader className="oh-drawer-head">
          <ResponsiveModalTitle className="oh-drawer-title">
            {isReschedule ? t("rescheduleFormTitle") : t("bookingFormTitle")}
          </ResponsiveModalTitle>
          {startDate ? (
            <ResponsiveModalDescription className="oh-drawer-sub">
              {slotLabel}
            </ResponsiveModalDescription>
          ) : (
            <ResponsiveModalDescription className="sr-only">
              {t("bookingFormSrFallback")}
            </ResponsiveModalDescription>
          )}
        </ResponsiveModalHeader>

        <div className="oh-drawer-body">
          {slot ? (
            <BookingForm
              handle={handle}
              slotStart={slot.start}
              rescheduleFromUid={rescheduleFromUid}
            />
          ) : null}
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

