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

export interface CalendarAdapter {
  readonly provider: CalendarProvider;

  listCalendars(): Promise<CalendarSummary[]>;

  getBusyTimes(opts: {
    calendarIds: readonly string[];
    from: Date;
    to: Date;
  }): Promise<BusyTime[]>;
}
