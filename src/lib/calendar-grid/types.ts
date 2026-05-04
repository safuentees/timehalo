
export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export type CalendarEvent = {
  id: string;
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  status: CalendarEventStatus;
  refId?: string;
};
