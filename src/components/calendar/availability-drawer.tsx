"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * Selecting a day advances to "time" (if the day has slots); selecting a
 * slot calls `onPickSlot` (parent closes the drawer). Back button returns
 * to "date" and restores the calendar's previous scroll position.
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
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // Per-phase scroll offsets — restored when returning to a phase so the
  // calendar doesn't snap back to month 1 after tapping BACK.
  const savedScrolls = useRef<Record<Phase, number>>({ date: 0, time: 0 });

  // Reset phase + snap + scroll whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    setPhase(initialPhase);
    setSnap(SNAP_POINTS[0]);
    savedScrolls.current = { date: 0, time: 0 };
  }, [open, initialPhase]);

  // Pre-click scroll snapshot. Clicking a day button focuses it, and the
  // browser's focus-driven scrollIntoView snaps the container before our
  // React click handler runs. A scroll listener would just see the post-
  // snap value (usually 0). pointerdown fires *before* focus, so it
  // captures the user's actual reading position.
  const scrollBeforeClick = useRef(0);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const snapshot = () => {
      scrollBeforeClick.current = body.scrollTop;
    };
    // Both listeners: pointerdown for real touch/mouse, mousedown for
    // synthetic CDP events that skip the pointer-event chain.
    body.addEventListener("pointerdown", snapshot, {
      passive: true,
      capture: true,
    });
    body.addEventListener("mousedown", snapshot, {
      passive: true,
      capture: true,
    });
    return () => {
      body.removeEventListener("pointerdown", snapshot, true);
      body.removeEventListener("mousedown", snapshot, true);
    };
  }, [open]);

  // Restore scroll + move focus when entering a phase. Double RAF gives
  // the newly-mounted phase content time to lay out so `scrollTop = N`
  // doesn't clamp to a transient short scrollHeight. Runs as a layout
  // effect so it beats any focus-driven auto-scroll from the browser.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        body.scrollTop = savedScrolls.current[phase] ?? 0;
        if (phase === "time") backButtonRef.current?.focus();
        else titleRef.current?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase]);

  const dayOfSlots = selectedDate ? slotsOn(slots, selectedDate) : [];

  function handleSelectDate(d: Date) {
    // Use the pre-click snapshot — reading bodyRef.scrollTop here would
    // return 0 because focus-driven scrollIntoView has already fired.
    savedScrolls.current.date = scrollBeforeClick.current;
    onSelectDate(d);
    if (slotsOn(slots, d).length === 0) return;
    setPhase("time");
  }

  function goBackToDate() {
    const body = bodyRef.current;
    if (body) savedScrolls.current.time = body.scrollTop;
    setPhase("date");
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
                ref={backButtonRef}
                type="button"
                className="bru-drawer-back"
                onClick={goBackToDate}
                aria-label="Back to calendar"
              >
                <ArrowLeftIcon />
                BACK
              </button>
            ) : null}
            <Drawer.Title
              ref={titleRef}
              tabIndex={-1}
              aria-live="polite"
              aria-atomic="true"
              className="bru-drawer-title"
            >
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
          <div ref={bodyRef} className="bru-drawer-body" data-phase={phase}>
            <div key={phase} className="bru-drawer-phase">
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
  if (n === 0) return "CLOSED";
  return `${n.toString().padStart(2, "0")} ${n === 1 ? "SLOT" : "SLOTS"}`;
}
