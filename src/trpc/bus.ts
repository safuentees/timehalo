import "server-only";
import { EventEmitter, on } from "node:events";

// In-memory pub/sub for host-scoped booking events. Pattern matches
// the tRPC v11 SSE subscription docs (verified via Context7, March
// 2025 announcement) — EventEmitter + `on()` async iterable +
// AbortSignal cleanup.
//
// Channel format `host:<hostId>:ws:<workspaceId>` (B.PT16). The
// workspace qualifier means a multi-workspace host's tab subscribed
// to workspace A's events doesn't receive workspace B's. Subscribers
// re-establish on workspace switch (B.PT17 invalidates + reconnects);
// emits always carry the booking row's own workspaceId, never the
// emitter's "active" workspace.
//
// Production caveat: this bus is per-process. In a multi-instance
// serverless deployment (Vercel functions), an event emitted on
// instance A won't be seen by a subscriber on instance B. For the
// learning project's scope (single dev server, or single long-running
// node process in prod), in-memory is fine. The fan-out upgrade path
// is Redis pub/sub or Postgres LISTEN/NOTIFY — same emit/subscribe
// API shape, swap the body of these two functions.

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
// 0 = unlimited. A long-lived host dashboard tab is one listener; we
// don't want tRPC's default warning at 10 listeners scaring the dev.
bus.setMaxListeners(0);

const channelFor = (hostId: string, workspaceId: string) =>
  `host:${hostId}:ws:${workspaceId}`;

export function emitBookingEvent(event: BookingBusEvent) {
  bus.emit(channelFor(event.hostId, event.workspaceId), event);
}

/**
 * Returns an async iterable that yields events for one (host,
 * workspace) until the AbortSignal fires. tRPC v11 wires the request's
 * signal into the subscription procedure — when the SSE connection
 * drops, the signal aborts and `on()` cleans up the listener
 * automatically.
 */
export function iterateBookingEvents(
  hostId: string,
  workspaceId: string,
  signal: AbortSignal,
) {
  return on(bus, channelFor(hostId, workspaceId), { signal });
}

/**
 * Test/debug helper — count active listeners on a channel. Useful in
 * a stress test ("open 5 tabs, close them, count back to zero").
 */
export function listenerCountFor(
  hostId: string,
  workspaceId: string,
): number {
  return bus.listenerCount(channelFor(hostId, workspaceId));
}
