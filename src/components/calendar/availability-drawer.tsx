"use client";

import { CalendarIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import { computeDensityMap, slotsOn, startOfToday, type Slot } from "@/lib/availability";
import { DayStrip } from "./day-strip";
import { MonthStack } from "./month-stack";
import { DaySlots } from "./day-slots";

type ViewMode = "strip" | "month";

type Props = {
  slots: Slot[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  onPickSlot: (slot: Slot) => void;
  months?: number;
};

const SNAP_POINTS: (number | string)[] = [0.6, 1];

/**
 * Single-view drawer — Airbnb Experiences pattern. Day strip + time chips
 * are always visible together; the full month grid is an opt-in escape
 * hatch via the calendar icon in the month-year bar.
 *
 * No phase swap, no back button. Tapping a day inside the month view
 * snaps back to strip view with that day selected.
 */
export function AvailabilityDrawer({
  slots,
  open,
  onOpenChange,
  selectedDate,
  onSelectDate,
  onPickSlot,
  months = 3,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("strip");
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const densityMap = useMemo(() => computeDensityMap(slots), [slots]);

  // Reset to strip view + first snap whenever the drawer opens. The React
  // 19 "set-state-in-effect" rule fires here, but resetting transient UI
  // state on an open-event is exactly what effects are for; there is no
  // external store to mirror.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewMode("strip");
    setSnap(SNAP_POINTS[0]);
  }, [open]);

  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];
  const monthBarDate = selectedDate ?? startOfToday();

  function handleStripSelect(d: Date) {
    onSelectDate(d);
  }

  function handleMonthPick(d: Date) {
    onSelectDate(d);
    setViewMode("strip");
  }

  function toggleView() {
    setViewMode((v) => (v === "strip" ? "month" : "strip"));
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
            <Drawer.Title className="bru-drawer-title">
              SCHEDULE YOUR MEETING
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              Pick a day and a time for your 15-minute meeting.
            </Drawer.Description>
          </div>

          <div className="bru-drawer-monthbar">
            <span className="bru-drawer-monthbar-label">
              {fmtMonthYear(monthBarDate)}
            </span>
            <button
              type="button"
              className="bru-view-toggle"
              aria-pressed={viewMode === "month"}
              aria-label={
                viewMode === "month" ? "Close month view" : "Open month view"
              }
              onClick={toggleView}
            >
              <CalendarIcon />
            </button>
          </div>

          <div className="bru-drawer-body" data-view={viewMode}>
            {viewMode === "strip" ? (
              <DayStrip
                slots={slots}
                selectedDate={selectedDate}
                onSelectDate={handleStripSelect}
              />
            ) : (
              <MonthStack
                months={months}
                densityMap={densityMap}
                selectedDate={selectedDate}
                onSelectDate={handleMonthPick}
              />
            )}

            {selectedDate ? (
              <DaySlots
                date={selectedDate}
                slots={dayOfSlots}
                onPick={onPickSlot}
              />
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

function fmtMonthYear(d: Date): string {
  return d
    .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    .toUpperCase();
}
