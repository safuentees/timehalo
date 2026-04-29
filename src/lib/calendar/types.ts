import "server-only";
import type { CalendarProvider } from "@/generated/prisma/enums";

export type BusyTime = {
  start: string;
  end: string;
};

export type CalendarSummary = {
  externalCalendarId: string;
  summary: string;
  isPrimary: boolean;
};

export type CalendarEventInput = {
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  attendeeName?: string;
};

export interface CalendarAdapter {
  readonly provider: CalendarProvider;

  listCalendars(): Promise<CalendarSummary[]>;

  getBusyTimes(opts: {
    calendarIds: readonly string[];
    from: Date;
    to: Date;
  }): Promise<BusyTime[]>;

  createEvent(input: CalendarEventInput): Promise<{ externalEventId: string }>;

  updateEvent(
    externalEventId: string,
    input: CalendarEventInput,
  ): Promise<void>;

  deleteEvent(opts: {
    calendarId: string;
    externalEventId: string;
  }): Promise<void>;
}
