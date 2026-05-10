// Sentry client SDK init — runs in the browser. Loaded automatically
// by `withSentryConfig` in `next.config.ts` when this file is present
// at the project root (matching `sentry.server.config.ts` +
// `sentry.edge.config.ts`).
//
// Refs verified via Context7:
//   - Next.js manual setup:
//     docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
//   - Session Replay sampling guidance:
//     docs.sentry.io/platforms/javascript/session-replay/configuration

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // E2 — Replay sampling. 1% of all sessions (replaysSessionSampleRate)
  // gives a steady volume for product debugging without burning quota.
  // 100% of sessions WITH errors (replaysOnErrorSampleRate) gives a
  // replay every time we want to investigate a real failure. Cal.com
  // ships the same 0.01 / 1.0 split in production.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // E3 — PII. The Replay integration masks all text + inputs by
  // default; we tighten further with maskAllText / maskAllInputs to
  // belt-and-braces protect visitor email + name from showing in
  // session replays. blockAllMedia stops images / videos from being
  // recorded — visitor avatars in particular.
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // 100% of traces in dev; 10% in prod (matches sentry.server.config).
  tracesSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  debug: false,

  // No-op when DSN is unset (CI / dev without a Sentry project).
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
