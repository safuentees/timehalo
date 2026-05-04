"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { EventChip } from "./event-chip";

// Drag wrapper around EventChip (B.PT150).
//
// Composition over modification: the chip primitive in `event-chip.tsx`
// stays focused on rendering + click semantics. This wrapper adds the
// drag handle without forcing every chip surface (Day, Week, Month-day-
// cell pop-out) to think about drag.
//
// PointerSensor `distance: 8` (configured at the DndContext level in
// `bookings-list.tsx`) means a click without movement still fires the
// chip's onClick — the cmd-click-to-open href from B.PT142 keeps
// working.
//
// KeyboardSensor (also configured globally) handles WCAG 2.1.1 — Tab
// to focus the chip, Space/Enter to lift, Arrow keys to step in
// `oneMinuteHeightPx * stepMinutes` increments (15 minutes by
// default), Space/Enter to drop, Escape to cancel.
//
// `data` payload travels with the drag op so the drop handler in the
// time-grid column can access the event's identity + original times
// without an out-of-band lookup.

export type DraggableEventDragData = {
  type: "event";
  refId: string;
  startMs: number;
  endMs: number;
};

export function DraggableEventChip({
  event,
  isSelected = false,
  onClick,
  href,
  disabled = false,
}: {
  event: CalendarEvent;
  isSelected?: boolean;
  onClick?: (event: CalendarEvent) => void;
  href?: string;
  /** When true, the chip renders without drag wiring — used for chips
   *  with no `refId` (synthetic / preview events) or when a parent
   *  view temporarily disables drag. */
  disabled?: boolean;
}) {
  const dragId = event.refId ?? event.id;
  const dragData: DraggableEventDragData = {
    type: "event",
    refId: dragId,
    startMs: event.start.getTime(),
    endMs: event.end.getTime(),
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: dragData,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      // Drag handle covers the whole chip. The chip's <button> / <a>
      // still receives the click events because PointerSensor's
      // `distance` activation lets clicks fall through.
      {...listeners}
      {...attributes}
      // While dragging, hide the original chip — the DragOverlay in
      // bookings-list.tsx renders the visual ghost. Keeping the
      // source visible would create a "two chips" illusion.
      style={{ opacity: isDragging ? 0 : undefined, height: "100%" }}
      // Reserve a focus-able drag handle for keyboard users; the
      // chip's <button> / <a> inside still owns the click semantics.
      // tabIndex=0 here lets KeyboardSensor pick up Space/Enter.
      tabIndex={disabled ? undefined : 0}
      aria-roledescription={disabled ? undefined : "draggable"}
    >
      <EventChip
        event={event}
        isSelected={isSelected}
        onClick={onClick}
        href={href}
      />
    </div>
  );
}
