import "server-only";
import type { CalendarProvider } from "@/generated/prisma/enums";

// Provider-agnostic calendar adapter (B3). Pattern reference:
// cal.com /packages/features/bookings/lib/EventManager.ts:81-94 —
// one interface, one impl per provider, factory dispatches by
// CalendarCredential.provider.
//
// Read-only for now: list calendars + fetch busy ranges. Two-way
// write (creating/updating events on the host's calendar in
// response to bookings) is deferred to a follow-up commit.

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
}
