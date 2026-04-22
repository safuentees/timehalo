"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { computeDensityMap, slotsOn, type Slot } from "@/lib/availability";
import { MonthStack } from "./month-stack";
import { DaySlots } from "./day-slots";

type Phase = "date" | "time";

type Props = {
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  months?: number;
  /** Phase to enter on open. Parent uses this to skip the calendar when
   *  the user already picked a date and is just editing the time. */
  initialPhase?: Phase;
};

const SNAP_POINTS: (number | string)[] = [0.6, 1];

/**
 * Two-phase bottom drawer:
 *   phase "date" → vertical month stack
 *   phase "time" → slot chips for `selectedDate`
 *
 * Selecting a day advances to "time"; selecting a slot calls `onPickSlot`
 * (parent closes the drawer). Back button returns to "date" without
 * clearing the selected date.
 */
export function AvailabilityDrawer({
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  months = 3,
  initialPhase = "date",
}: Props) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Reset phase + snap + scroll whenever the drawer opens. Parent's
  // `initialPhase` decides whether to land on calendar or time picker.
  useEffect(() => {
    if (!open) return;
    setPhase(initialPhase);
    setSnap(SNAP_POINTS[0]);
  }, [open, initialPhase]);

  // Scroll drawer body to top on phase swap so the user isn't left
  // halfway down the calendar after tapping a day.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      bodyRef.current?.scrollTo({ top: 0 }),
    );
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];

  function handleSelectDate(d: Date) {
    onSelectDate(d);
    setPhase("time");
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="bru-drawer-overlay" />
        <Drawer.Content className="bru-drawer-content">
          <Drawer.Handle className="bru-drawer-handle" />
          <div className="bru-drawer-head">
            {phase === "time" ? (
              <button
                type="button"
                className="bru-drawer-back"
                onClick={() => setPhase("date")}
                aria-label="Back to calendar"
              >
                <ArrowLeftIcon />
                BACK
              </button>
            ) : null}
            <Drawer.Title className="bru-drawer-title">
              {phase === "date"
                ? "PICK A DATE"
                : selectedDate
                  ? `${fmtHeadDate(selectedDate)} · ${slotCountLabel(dayOfSlots.length)}`
                  : "PICK A TIME"}
            </Drawer.Title>
            <Drawer.Description className="bru-drawer-sub">
              {phase === "date"
                ? "Scroll months · tap a day"
                : "Tap a time · 15 min"}
            </Drawer.Description>
          </div>
          <div ref={bodyRef} className="bru-drawer-body">
            {phase === "date" ? (
              <MonthStack
                months={months}
                densityMap={densityMap}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
            ) : selectedDate ? (
              <DaySlots
                date={selectedDate}
                slots={dayOfSlots}
                onPick={onPickSlot}
              />
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function fmtHeadDate(d: Date): string {
  return d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

function slotCountLabel(n: number): string {
  return `${n.toString().padStart(2, "0")} ${n === 1 ? "SLOT" : "SLOTS"}`;
}
