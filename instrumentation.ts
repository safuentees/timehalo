// Next.js 15+ instrumentation hook. The `register()` export runs
// once at startup and lets us load runtime-specific Sentry init.
// `onRequestError` exports Sentry.captureRequestError so errors
// thrown inside server components / middleware / route handlers
// surface with the right framework context attached.
//
// Pattern from sentry.io/platforms/javascript/guides/nextjs/manual-setup
// (verified via Context7). Requires @sentry/nextjs >= 8.28.0 and
// Next.js 15+, both of which we satisfy.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
