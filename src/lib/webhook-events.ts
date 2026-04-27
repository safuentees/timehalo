export const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
