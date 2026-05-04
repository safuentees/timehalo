"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { EventChip } from "./event-chip";

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
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0 : undefined, height: "100%" }}
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
