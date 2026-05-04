import { describe, it, expect } from "vitest";
import { formatTimeRange } from "../event-chip";
import type { CalendarEvent } from "@/lib/calendar-grid/types";

function makeEvent(start: Date, end: Date): CalendarEvent {
  return {
    id: "test",
    title: "Test",
    start,
    end,
    status: "confirmed",
  };
}

describe("formatTimeRange", () => {
  it("drops redundant 'AM' on the start when both endpoints are AM", () => {
    const start = new Date(2026, 4, 4, 10, 0); // 10:00 AM
    const end = new Date(2026, 4, 4, 10, 30); //  10:30 AM
    expect(formatTimeRange(makeEvent(start, end))).toBe("10:00 – 10:30 AM");
  });

  it("drops redundant 'PM' on the start when both endpoints are PM", () => {
    const start = new Date(2026, 4, 4, 14, 0); // 2:00 PM
    const end = new Date(2026, 4, 4, 14, 45); // 2:45 PM
    expect(formatTimeRange(makeEvent(start, end))).toBe("2:00 – 2:45 PM");
  });

  it("keeps both period markers when crossing the noon boundary", () => {
    const start = new Date(2026, 4, 4, 11, 30); // 11:30 AM
    const end = new Date(2026, 4, 4, 12, 30); // 12:30 PM
    expect(formatTimeRange(makeEvent(start, end))).toBe(
      "11:30 AM – 12:30 PM",
    );
  });

  it("keeps both period markers when crossing midnight (PM → AM)", () => {
    const start = new Date(2026, 4, 4, 23, 0); // 11:00 PM
    const end = new Date(2026, 4, 4, 23, 45); // 11:45 PM
    expect(formatTimeRange(makeEvent(start, end))).toBe("11:00 – 11:45 PM");
  });

  it("preserves an exact 30-minute slot inside AM block", () => {
    const start = new Date(2026, 4, 4, 9, 0);
    const end = new Date(2026, 4, 4, 9, 30);
    expect(formatTimeRange(makeEvent(start, end))).toBe("9:00 – 9:30 AM");
  });

  it("emits 12 (noon) at the boundary as 12 PM", () => {
    const start = new Date(2026, 4, 4, 12, 0); // 12:00 PM
    const end = new Date(2026, 4, 4, 12, 30); // 12:30 PM
    expect(formatTimeRange(makeEvent(start, end))).toBe("12:00 – 12:30 PM");
  });
});
