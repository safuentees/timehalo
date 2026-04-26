import "server-only";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";

// Selective per-procedure observability — port of cal.com's
// packages/lib/sentryWrapper.ts. Three runtime modes:
//   1. Sentry configured (NEXT_PUBLIC_SENTRY_DSN set, Sentry.init
//      ran) → defers to Sentry.startSpan. Errors thrown inside the
//      callback are auto-captured by Sentry's tracing integration.
//   2. Development without DSN → structured JSON.stringify lines on
//      success + console.error on throw, with full attributes +
//      duration. Greppable in dev terminal, pipeable to a log
//      aggregator later.
//   3. Production without DSN (CI, tests, dev deploys) → silent
//      no-op so we don't spam stdout in environments without a sink.
// Always rethrows. Span is observation, not interception.
//
// Why selective + not blanket middleware: per cal.com's guidance and
// Sentry's own Next.js docs (verified via Context7), blanket per-
// procedure timing middleware spams telemetry with noise (every
// notes.list, every users.me). Wrap the procedures that DO real
// side effects — booking writes, future confirm/cancel, future
// webhook dispatch. Signal over noise.

export interface TelemetrySpan {
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface TelemetrySpanOptions {
  name: string;
  /** Operation type for grouping in Sentry (e.g. "booking.write"). */
  op?: string;
  /** Attributes attached at span start. setAttribute can add more. */
  attributes?: Record<string, string | number | boolean>;
}

const noOpSpan: TelemetrySpan = {
  setAttribute: () => {},
};

function isProd(): boolean {
  return env.NODE_ENV === "production";
}

function isSentryConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SENTRY_DSN);
}

/**
 * Wraps an async callback with a telemetry span. Returns the callback's
 * return value. Captures duration, attributes, and any thrown error.
 *
 * Modes:
 * - Sentry configured (NEXT_PUBLIC_SENTRY_DSN set): wraps the callback
 *   in Sentry.startSpan so the span shows up in the Sentry trace UI
 *   with attributes, op category, and any thrown error attached. We
 *   catch + captureException + rethrow so tRPC's own error path still
 *   fires and the test suite still observes the throw.
 * - Development (no DSN): structured console.log on completion +
 *   console.error on throw, with full attributes + duration.
 * - Production without DSN (CI, tests, dev deploys): no-op so we
 *   don't spam stdout in environments that don't have a log sink.
 */
export async function withSpan<T>(
  options: TelemetrySpanOptions,
  callback: (span: TelemetrySpan) => Promise<T>,
): Promise<T> {
  if (isSentryConfigured()) {
    return Sentry.startSpan(
      {
        name: options.name,
        op: options.op,
        attributes: options.attributes,
      },
      async (sentrySpan) => {
        // Wrap Sentry's Span in our minimal interface so callers
        // don't depend on the Sentry types. Same setAttribute shape
        // as the console-span path.
        const span: TelemetrySpan = {
          setAttribute(key, value) {
            sentrySpan.setAttribute(key, value);
          },
        };
        try {
          return await callback(span);
        } catch (error) {
          // captureException attaches the active span context, so
          // the error in Sentry has the procedure name + attributes
          // already linked. Without this, errors that bubble up are
          // captured by onRequestError but lose the span correlation.
          Sentry.captureException(error);
          throw error;
        }
      },
    );
  }

  if (!isProd()) {
    return runWithConsoleSpan(options, callback);
  }

  // Prod without DSN — silent. Don't accumulate attribute objects in
  // memory, don't call console. The span is a no-op.
  return callback(noOpSpan);
}

async function runWithConsoleSpan<T>(
  options: TelemetrySpanOptions,
  callback: (span: TelemetrySpan) => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const attributes: Record<string, string | number | boolean> = {
    ...options.attributes,
  };
  const span: TelemetrySpan = {
    setAttribute(key, value) {
      attributes[key] = value;
    },
  };

  try {
    const result = await callback(span);
    const durationMs = Date.now() - startedAt;
    // One structured line. Easy to grep, easy to ship to a log
    // aggregator later (Axiom, Datadog, console-pipe-to-logflare).
    console.log(
      JSON.stringify({
        kind: "telemetry",
        name: options.name,
        op: options.op,
        status: "ok",
        durationMs,
        attributes,
      }),
    );
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errMsg =
      error instanceof Error ? error.message : String(error);
    const errName = error instanceof Error ? error.name : "Unknown";
    console.error(
      JSON.stringify({
        kind: "telemetry",
        name: options.name,
        op: options.op,
        status: "error",
        durationMs,
        attributes,
        errorName: errName,
        errorMessage: errMsg,
      }),
    );
    // Always rethrow — span is observation, not interception. tRPC's
    // own error path still surfaces the error to the client.
    throw error;
  }
}
