// Sentry edge SDK init — runs in Vercel Edge / Cloudflare Workers
// runtimes (proxy.ts middleware, edge route handlers). Smaller API
// surface than the Node SDK; the basics are the same.
//
// Our proxy.ts runs in the edge runtime and can throw — having
// Sentry here means those failures get reported alongside the
// server-side ones.

import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "@/lib/sentry-redact";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate:
    process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  debug: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // E3 — same PII redactor as the server config. Edge runtime
  // matters because proxy.ts handles ?ref=… params + may throw
  // around request URLs that could carry PII.
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
