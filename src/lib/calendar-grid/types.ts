// Shared types for the hand-rolled calendar grid (Day, Week, Month).
//
// `CalendarEvent` is the intermediate shape — `bookings.listForHost`
// rows get adapted to this in B.PT137 wiring. Keeping the type
// independent of the Prisma `Booking` row means the calendar-grid
// components stay testable with synthetic mock data and stay reusable
// if non-booking sources (e.g. blocked time, calendar imports) need
// the same rendering shape.

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export type CalendarEvent = {
  id: string;
  /** Display name (e.g. visitor's name) */
  title: string;
  /** Human-readable subtitle, e.g. event-type name. Optional. */
  subtitle?: string;
  start: Date;
  end: Date;
  status: CalendarEventStatus;
  /** Pass-through for the click handler — typically Booking.publicUid. */
  refId?: string;
};
