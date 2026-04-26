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
};

export function BookingDrawer({
  handle,
  slot,
  open,
  onOpenChange,
}: Props) {
  const startDate = slot ? new Date(slot.start) : null;
  const isOpen = open && !!slot;

  return (
    <ResponsiveModal open={isOpen} onOpenChange={onOpenChange} nested>
      <ResponsiveModalContent mobileClassName="bru-drawer-content-nested">
        <ResponsiveModalHeader className="bru-drawer-head">
          <ResponsiveModalTitle className="bru-drawer-title">
            CONFIRM BOOKING
          </ResponsiveModalTitle>
          {startDate ? (
            <ResponsiveModalDescription className="bru-drawer-sub">
              {fmtSlot(startDate)}
            </ResponsiveModalDescription>
          ) : (
            <ResponsiveModalDescription className="sr-only">
              Booking form
            </ResponsiveModalDescription>
          )}
        </ResponsiveModalHeader>

        <div className="bru-drawer-body">
          {slot ? <BookingForm handle={handle} slotStart={slot.start} /> : null}
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
