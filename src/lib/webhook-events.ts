// Webhook events the host can subscribe to. CSV-stored on the
// WebhookSubscription row; new events go in this list when their
// state-machine transitions ship.
//
// Lives in lib/ (not in the trpc tree) because both the tRPC webhooks
// router AND `src/lib/tasks.ts` need it — tasks.ts is what actually
// schedules deliveries based on the event name.
export const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
