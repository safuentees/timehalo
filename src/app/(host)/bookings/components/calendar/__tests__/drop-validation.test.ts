import { describe, it, expect } from "vitest";
import { validateDrop, type AvailabilityRange } from "../drop-validation";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

// B.PT152 — drop-validation contract tests.
//
// Pre-flight rules the drag-to-reschedule client check enforces, in
// the same order the server's bookings.reschedule procedure checks
// (in-past → slot-collision → availability). Pinning these so a
// future refactor of the client-side check can't silently regress to
// "open dialog → 404 → confused user".

const MONDAY_9_TO_5: AvailabilityRange = {
  dayOfWeek: "MONDAY",
  startTime: "09:00",
  endTime: "17:00",
};

function makeEvent(refId: string, start: Date): CalendarEvent {
  return {
    id: refId,
    refId,
    title: "Test",
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    status: "confirmed",
  };
}

describe("validateDrop", () => {
  // Pin a Monday for predictable day-of-week behaviour.
  // 2026-05-04 = Monday. Times below all use local components.
  const NOW = new Date(2026, 4, 4, 8, 0); // Mon May 4 2026, 8:00 AM

  it("accepts a slot inside availability with no collision", () => {
    const drop = new Date(2026, 4, 4, 10, 0); // Mon 10:00 — in 9-17
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [makeEvent("src", new Date(2026, 4, 4, 9, 0))],
      ranges: [MONDAY_9_TO_5],
      now: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a slot occupied by ANOTHER booking", () => {
    const drop = new Date(2026, 4, 4, 11, 0);
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [
        makeEvent("src", new Date(2026, 4, 4, 9, 0)),
        makeEvent("other", drop),
      ],
      ranges: [MONDAY_9_TO_5],
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "slot-occupied" });
  });

  it("does NOT count the source booking as a collision (defense in depth)", () => {
    const drop = new Date(2026, 4, 4, 9, 0); // same as source's start
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [makeEvent("src", drop)],
      ranges: [MONDAY_9_TO_5],
      now: NOW,
    });
    // No collision (source excluded). Same-time drops are caught by
    // the caller's no-op short-circuit before this fn runs anyway.
    expect(result).toEqual({ ok: true });
  });

  it("rejects a slot outside availability hours", () => {
    const drop = new Date(2026, 4, 4, 8, 0); // 8:00 — before 9 start
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [makeEvent("src", new Date(2026, 4, 4, 9, 0))],
      ranges: [MONDAY_9_TO_5],
      now: new Date(2026, 4, 4, 7, 0),
    });
    expect(result).toEqual({ ok: false, reason: "outside-availability" });
  });

  it("rejects a slot on a day with no availability ranges (e.g. weekend)", () => {
    const drop = new Date(2026, 4, 3, 10, 0); // Sun 10:00 — no ranges
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [],
      ranges: [MONDAY_9_TO_5], // only Monday
      now: new Date(2026, 4, 3, 9, 0),
    });
    expect(result).toEqual({ ok: false, reason: "outside-availability" });
  });

  it("rejects a slot in the past", () => {
    const drop = new Date(2026, 4, 4, 9, 0); // Mon 9:00 — past
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [],
      ranges: [MONDAY_9_TO_5],
      now: new Date(2026, 4, 4, 10, 0), // current time = 10am Monday
    });
    expect(result).toEqual({ ok: false, reason: "in-past" });
  });

  it("treats range end-time as exclusive (17:00 is NOT inside 09:00-17:00)", () => {
    const drop = new Date(2026, 4, 4, 17, 0);
    const result = validateDrop({
      newSlotStart: drop,
      sourceRefId: "src",
      events: [],
      ranges: [MONDAY_9_TO_5],
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "outside-availability" });
  });
});
