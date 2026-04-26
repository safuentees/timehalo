// Sentry edge SDK init — runs in Vercel Edge / Cloudflare Workers
// runtimes (proxy.ts middleware, edge route handlers). Smaller API
// surface than the Node SDK; the basics are the same.
//
// Our proxy.ts runs in the edge runtime and can throw — having
// Sentry here means those failures get reported alongside the
// server-side ones.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  debug: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
