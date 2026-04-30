import { describe, it, expect } from "vitest";
import {
  emitBookingEvent,
  iterateBookingEvents,
  listenerCountFor,
} from "@/trpc/bus";

// Tests for §10.1 item 8 — the in-memory event bus that powers the
// SSE subscription. Testing the bus helpers directly (not the
// subscription procedure) is the right scope: the procedure body is
// 6 lines and just delegates here.
//
// End-to-end SSE testing would require spinning up an HTTP server
// + a real EventSource consumer — out of scope for unit tests at
// this level.
//
// B.PT16 — channel is `host:<hostId>:ws:<workspaceId>`. Subscribers
// pick up only events for one (host, workspace) pair; emits always
// carry the booking row's own workspaceId.

describe("bus — emit + iterate + listener cleanup", () => {
  it("delivers an emitted event to a same-process subscriber", async () => {
    const ac = new AbortController();
    const iterable = iterateBookingEvents("host-1", "ws-1", ac.signal);

    // Emit AFTER subscribing, then consume the next event.
    emitBookingEvent({
      type: "created",
      bookingPublicUid: "uid-abc",
      hostId: "host-1",
      workspaceId: "ws-1",
      visitorName: "Alice",
      slotStart: "2026-01-01T10:00:00.000Z",
      occurredAt: new Date().toISOString(),
    });

    const { value, done } = await (iterable[Symbol.asyncIterator]
      ? iterable[Symbol.asyncIterator]().next()
      : (iterable as AsyncGenerator).next());
    expect(done).toBe(false);
    // node:events `on()` yields tuples — first arg is the event.
    expect(value[0]).toMatchObject({
      type: "created",
      bookingPublicUid: "uid-abc",
      hostId: "host-1",
      workspaceId: "ws-1",
    });

    ac.abort();
  });

  it("does NOT deliver events for a different hostId (channel isolation)", async () => {
    const ac = new AbortController();
    const iterable = iterateBookingEvents("host-A", "ws-1", ac.signal);

    // Emit on host-B's channel — host-A's iterator should never see it.
    emitBookingEvent({
      type: "created",
      bookingPublicUid: "uid-xyz",
      hostId: "host-B",
      workspaceId: "ws-1",
      visitorName: "Bob",
      slotStart: "2026-01-01T10:00:00.000Z",
      occurredAt: new Date().toISOString(),
    });

    // Race the iterator against a 100ms timeout — if a value arrives,
    // the assertion fires and fails. If the timeout wins, the
    // isolation worked.
    const next = (iterable as AsyncGenerator).next();
    const timeout = new Promise<{ done: boolean; value: unknown }>(
      (resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 100),
    );
    const winner = await Promise.race([next, timeout]);
    expect(winner.done).toBe(true);

    ac.abort();
  });

  it("does NOT deliver events across workspaces for the same host (B.PT16)", async () => {
    const ac = new AbortController();
    // Subscriber is "in" workspace A. Emit happens against the same
    // host but in workspace B.
    const iterable = iterateBookingEvents("host-multi-ws", "ws-A", ac.signal);

    emitBookingEvent({
      type: "created",
      bookingPublicUid: "uid-cross",
      hostId: "host-multi-ws",
      workspaceId: "ws-B",
      visitorName: "Cross",
      slotStart: "2026-01-01T10:00:00.000Z",
      occurredAt: new Date().toISOString(),
    });

    const next = (iterable as AsyncGenerator).next();
    const timeout = new Promise<{ done: boolean; value: unknown }>(
      (resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 100),
    );
    const winner = await Promise.race([next, timeout]);
    expect(winner.done).toBe(true);

    ac.abort();
  });

  it("AbortSignal cleanup zeroes the listener count", async () => {
    const ac = new AbortController();
    const iterable = iterateBookingEvents(
      "host-cleanup",
      "ws-cleanup",
      ac.signal,
    );

    expect(listenerCountFor("host-cleanup", "ws-cleanup")).toBe(1);

    // Trigger the abort + drain the iterator so node:events removes
    // the listener.
    ac.abort();
    try {
      await (iterable as AsyncGenerator).next();
    } catch {
      // node:events.on() throws on abort; expected.
    }

    expect(listenerCountFor("host-cleanup", "ws-cleanup")).toBe(0);
  });

  it("multiple subscribers on the same channel each receive the event", async () => {
    const ac = new AbortController();
    const iter1 = iterateBookingEvents("host-multi", "ws-multi", ac.signal);
    const iter2 = iterateBookingEvents("host-multi", "ws-multi", ac.signal);

    expect(listenerCountFor("host-multi", "ws-multi")).toBe(2);

    emitBookingEvent({
      type: "cancelled",
      bookingPublicUid: "uid-cancel",
      hostId: "host-multi",
      workspaceId: "ws-multi",
      visitorName: "Carol",
      slotStart: "2026-01-01T10:00:00.000Z",
      occurredAt: new Date().toISOString(),
    });

    const [r1, r2] = await Promise.all([
      (iter1 as AsyncGenerator).next(),
      (iter2 as AsyncGenerator).next(),
    ]);
    expect(r1.value[0].bookingPublicUid).toBe("uid-cancel");
    expect(r2.value[0].bookingPublicUid).toBe("uid-cancel");

    ac.abort();
  });
});
