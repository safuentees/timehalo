
import { router } from "@/trpc/trpc";
import { admin } from "./routers/admin";
import { audit } from "./routers/audit";
import { auth } from "./routers/auth";
import { billing } from "./routers/billing";
import { bookings } from "./routers/bookings";
import { calendar } from "./routers/calendar";
import { eventTypes } from "./routers/event-types";
import { invitations } from "./routers/invitations";
import { schedule } from "./routers/schedule";
import { users } from "./routers/users";
import { webhooks } from "./routers/webhooks";
import { workflows } from "./routers/workflows";
import { workspaces } from "./routers/workspaces";

export const appRouter = router({
  schedule,
  auth,
  users,
  bookings,
  webhooks,
  workspaces,
  invitations,
  admin,
  audit,
  billing,
  calendar,
  eventTypes,
  workflows,
});

export type AppRouter = typeof appRouter;

export { createCaller } from "@/trpc/trpc";
export { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
