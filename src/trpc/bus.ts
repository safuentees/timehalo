import "server-only";
import { EventEmitter, on } from "node:events";

export type BookingBusEvent = {
  type: "created" | "cancelled";
  bookingPublicUid: string;
  hostId: string;
  visitorName: string;
  slotStart: string; // ISO
  occurredAt: string; // ISO
};

const bus = new EventEmitter();
bus.setMaxListeners(0);

const channelFor = (hostId: string) => `host:${hostId}`;

export function emitBookingEvent(event: BookingBusEvent) {
  bus.emit(channelFor(event.hostId), event);
}

export function iterateBookingEvents(hostId: string, signal: AbortSignal) {
  return on(bus, channelFor(hostId), { signal });
}

export function listenerCountFor(hostId: string): number {
  return bus.listenerCount(channelFor(hostId));
}
