import "server-only";
import type { CalendarProvider } from "@/generated/prisma/enums";

// Provider-agnostic calendar adapter (B3 + B2). Pattern reference:
// cal.com /packages/features/bookings/lib/EventManager.ts:81-94 —
// one interface, one impl per provider, factory dispatches by
// CalendarCredential.provider.
//
// Read side (B3): list calendars + fetch busy ranges.
// Write side (B2): create / update / delete events. Wired through
// the Task queue (calendarWrite type) so a delivery failure can't
// roll back the booking write the visitor just confirmed; retries
// + dedup come for free.

export type BusyTime = {
  /** Inclusive start, ISO UTC. */
  start: string;
  /** Exclusive end, ISO UTC. */
  end: string;
};

export type CalendarSummary = {
  externalCalendarId: string;
  summary: string;
  isPrimary: boolean;
};

export type CalendarEventInput = {
  /** Provider's calendar id to write into ("primary" or a specific id). */
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  /** Visitor email — added as an attendee so they get the upstream invite. */
  attendeeEmail?: string;
  attendeeName?: string;
};

export interface CalendarAdapter {
  readonly provider: CalendarProvider;

  /**
   * List the calendars on the connected account. The user picks a
   * subset to read busy-times from via SelectedCalendar rows.
   */
  listCalendars(): Promise<CalendarSummary[]>;

  /**
   * Fetch busy ranges for the supplied calendar ids over [from, to).
   * Returns merged + sorted ranges in ISO UTC.
   */
  getBusyTimes(opts: {
    calendarIds: readonly string[];
    from: Date;
    to: Date;
  }): Promise<BusyTime[]>;

  /**
   * Create an event on the provider's calendar. Returns the
   * provider's event id so future updates / deletes can target it.
   */
  createEvent(input: CalendarEventInput): Promise<{ externalEventId: string }>;

  /**
   * Update an existing event identified by its provider id.
   */
  updateEvent(
    externalEventId: string,
    input: CalendarEventInput,
  ): Promise<void>;

  /**
   * Delete an event identified by its provider id. Idempotent — a
   * 404 from the provider (event already gone) is swallowed so
   * cancel-after-disconnect doesn't permanently fail.
   */
  deleteEvent(opts: {
    calendarId: string;
    externalEventId: string;
  }): Promise<void>;
}
