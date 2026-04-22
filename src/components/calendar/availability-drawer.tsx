"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import {
  computeDensityMap,
  slotsOn,
  type Slot,
} from "@/lib/availability";
import { MonthStack } from "./month-stack";
import { DaySlots } from "./day-slots";

type Props = {
  slots: Slot[];
  children: ReactNode;
  months?: number;
  initialDate?: Date;
};

/**
 * Bottom-anchored drawer with a vertical stack of months. Children render
 * inside Drawer.Trigger via asChild — pass a <Button /> (or anything
 * keyboard-focusable).
 *
 * The component is pure: parent owns `slots`, we don't reach into tRPC.
 */
const SNAP_POINTS: (number | string)[] = [0.6, 1];

export function AvailabilityDrawer({
  slots,
  children,
  months = 3,
  initialDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    initialDate,
  );
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // On open, scroll the month stack back to the top so today's month is
  // in view, and reset snap to the first stop.
  useEffect(() => {
    if (!open) return;
    setSnap(SNAP_POINTS[0]);
    const id = requestAnimationFrame(() => {
      stackRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Trigger asChild>{children}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content">
          <Drawer.Handle className="bru-drawer-handle" />
          <div className="bru-drawer-head">
            <Drawer.Title className="bru-drawer-title">PICK A DATE</Drawer.Title>
            <Drawer.Description className="bru-drawer-sub">
              Scroll months · tap a day · see times
            </Drawer.Description>
          </div>
          <div ref={stackRef} className="bru-drawer-body">
            <MonthStack
              months={months}
              densityMap={densityMap}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            {selectedDate ? (
              <DaySlots date={selectedDate} slots={dayOfSlots} />
            ) : (
              <p className="bru-drawer-hint">
                — TAP A DATE ABOVE TO SEE TIMES —
              </p>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
