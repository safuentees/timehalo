import "server-only";
import { EventEmitter, on } from "node:events";

export type BookingBusEvent = {
  type: "created" | "cancelled";
  bookingPublicUid: string;
  hostId: string;
  workspaceId: string;
  visitorName: string;
  slotStart: string; // ISO
  occurredAt: string; // ISO
};

const bus = new EventEmitter();
bus.setMaxListeners(0);

const channelFor = (hostId: string, workspaceId: string) =>
  `host:${hostId}:ws:${workspaceId}`;

export function emitBookingEvent(event: BookingBusEvent) {
  bus.emit(channelFor(event.hostId, event.workspaceId), event);
}

export function iterateBookingEvents(
  hostId: string,
  workspaceId: string,
  signal: AbortSignal,
) {
  return on(bus, channelFor(hostId, workspaceId), { signal });
}

export function listenerCountFor(
  hostId: string,
  workspaceId: string,
): number {
  return bus.listenerCount(channelFor(hostId, workspaceId));
}
