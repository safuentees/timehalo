// Sentry server SDK init — runs in the Node.js runtime (App Router
// route handlers, tRPC procedures, server components, instrumented
// crons). Loaded by `instrumentation.ts` on Next.js startup.
//
// Refs verified via Context7:
//   - Manual setup guide:
//     docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
//   - tracesSampleRate convention: 1.0 in dev, 0.1 in prod, so dev
//     traces are visible without burning quota in prod.

import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "@/lib/sentry-redact";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% of traces in dev; 10% in prod. Sampling is on the *trace*,
  // not on every span — once a trace is sampled, all its spans go.
  tracesSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Surface clearer errors during local setup. Off in prod.
  debug: false,

  // No-op when DSN is missing (e.g. local dev without a Sentry
  // project, CI). The SDK doesn't throw; it just doesn't report.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // E3 — PII redaction. Walks every event's breadcrumbs / extra /
  // contexts / message / exception value text, replaces values keyed
  // by PII names with "<redacted>", and partial-masks any
  // email-shaped string ("ma***@example.com"). Defends against
  // visitor email + name leaking into Sentry from a thrown error
  // whose message happens to include the booking input.
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
