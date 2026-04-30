"use client";

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
  const startDate = slot ? new Date(slot.start) : null;
  const isOpen = open && !!slot;
  const isReschedule = Boolean(rescheduleFromUid);

  return (
    <ResponsiveModal open={isOpen} onOpenChange={onOpenChange} nested>
      <ResponsiveModalContent mobileClassName="oh-drawer-content-nested">
        <ResponsiveModalHeader className="oh-drawer-head">
          <ResponsiveModalTitle className="oh-drawer-title">
            {isReschedule ? "CONFIRM RESCHEDULE" : "CONFIRM BOOKING"}
          </ResponsiveModalTitle>
          {startDate ? (
            <ResponsiveModalDescription className="oh-drawer-sub">
              {fmtSlot(startDate)}
            </ResponsiveModalDescription>
          ) : (
            <ResponsiveModalDescription className="sr-only">
              Booking form
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

function fmtSlot(d: Date): string {
  const day = d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}
