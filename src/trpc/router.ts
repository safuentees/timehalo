// Root tRPC router. Per-domain subrouters live under `./routers/`.
// Procedure builders + the rate-limit factory live in `./trpc.ts`.
//
// Why split: 2900 lines crossed the comfort threshold for one-file
// navigation. Rallly-style per-domain split is the right scale here
// (cal.com's per-procedure split would be overkill for ~80 procedures).
//
// What stays here: the merge + the public-surface re-exports. Tests
// import `appRouter` + `createCaller` from this module; `lib/tasks.ts`
// imports `WebhookEvent`; the API route handler + RSC tree import
// `appRouter` + `AppRouter`. Keeping that surface stable means no
// downstream churn on the refactor.

import { router } from "@/trpc/trpc";
import { admin } from "./routers/admin";
import { auth } from "./routers/auth";
import { bookings } from "./routers/bookings";
import { calendar } from "./routers/calendar";
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
  calendar,
  workflows,
});

export type AppRouter = typeof appRouter;

export { createCaller } from "@/trpc/trpc";
export { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";
