"use client";

import { Drawer } from "vaul";
import type { Slot } from "@/lib/availability";
import { BookingForm } from "./booking-form";

type Props = {
  handle: string;
  slot: Slot | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Nested second-stage drawer — opens immediately after a slot is
 * picked in the availability sheet. This keeps the date/time chooser
 * and the booking form in a single stacked flow while preserving the
 * selected slot if the visitor closes the form and goes back.
 */
export function BookingDrawer({
  handle,
  slot,
  open,
  onOpenChange,
}: Props) {
  const startDate = slot ? new Date(slot.start) : null;
  const isOpen = open && !!slot;

  return (
    <Drawer.NestedRoot open={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content bru-drawer-content-nested">
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
              />
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
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
