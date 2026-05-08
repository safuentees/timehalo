
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  tracesSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  debug: false,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
