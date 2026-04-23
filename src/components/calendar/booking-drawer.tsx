"use client";

import { Drawer } from "vaul";
import type { Slot } from "@/lib/availability";
import { BookingForm } from "./booking-form";

type Props = {
  handle: string;
  slot: Slot | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful booking. Parent clears local selection +
   *  closes this drawer. */
  onBooked: () => void;
};

/**
 * Second-stage drawer — opened from the host profile's "BOOK NOW"
 * button AFTER a slot has been selected in the first drawer. Shows
 * the chosen date/time in the header plus the name/email/question
 * form. On success the parent clears its selection state and
 * `schedule.getUpcomingSlots` auto-invalidates (global hook) so the
 * just-booked chip disappears.
 */
export function BookingDrawer({
  handle,
  slot,
  open,
  onOpenChange,
  onBooked,
}: Props) {
  const startDate = slot ? new Date(slot.start) : null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content">
          <Drawer.Handle className="bru-drawer-handle" />
          <div className="bru-drawer-head">
            <Drawer.Title className="bru-drawer-title">
              CONFIRM BOOKING
            </Drawer.Title>
            {startDate ? (
              <Drawer.Description className="bru-drawer-sub">
                {fmtSlot(startDate)} · 15 MIN
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">
                Booking form
              </Drawer.Description>
            )}
          </div>

          <div className="bru-drawer-body">
            {slot ? (
              <BookingForm
                handle={handle}
                slotStart={slot.start}
                onBooked={onBooked}
              />
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
  return `${day} · ${time}`;
}
