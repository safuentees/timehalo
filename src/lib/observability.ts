import "server-only";

// Selective per-procedure observability — port of cal.com's
// packages/lib/sentryWrapper.ts (verified via Context7 against Sentry's
// own Next.js docs). The shape is identical so swapping in real Sentry
// later is a one-file change:
//
//   1. pnpm add @sentry/nextjs
//   2. Run `npx @sentry/wizard@latest -i nextjs` to generate
//      instrumentation.ts + sentry.{server,edge}.config.ts.
//   3. In withSpan below, when NEXT_PUBLIC_SENTRY_DSN is set, replace
//      the console-fallback branch with:
//        return Sentry.startSpan(
//          { name, op, attributes },
//          (sentrySpan) => callback({ setAttribute: (k,v) => sentrySpan.setAttribute(k,v) })
//        );
//      That's the only change. Caller code (the .mutation() wraps in
//      bookings router) doesn't move.
//
// Why selective + not blanket middleware: per cal.com's guidance and
// Sentry's own docs, blanket per-procedure timing middleware spams
// telemetry with noise (every notes.list, every users.me). Wrap the
// procedures that DO real side effects — booking writes, future
// confirm/cancel, future webhook dispatch. Signal over noise.

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
  return process.env.NODE_ENV === "production";
}

function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/**
 * Wraps an async callback with a telemetry span. Returns the callback's
 * return value. Captures duration, attributes, and any thrown error.
 *
 * Modes:
 * - Sentry configured (NEXT_PUBLIC_SENTRY_DSN set): would defer to
 *   Sentry.startSpan. NOT YET WIRED — see comment block at top of file.
 * - Development (no DSN): structured console.log on completion +
 *   console.error on throw, with full attributes + duration.
 * - Production without DSN (CI, tests, dev deploys): no-op so we
 *   don't spam stdout in environments that don't have a log sink.
 */
export async function withSpan<T>(
  options: TelemetrySpanOptions,
  callback: (span: TelemetrySpan) => Promise<T>,
): Promise<T> {
  // Future Sentry path placeholder — see top-of-file swap instructions.
  if (isSentryConfigured()) {
    // Until Sentry is installed, treat "DSN set" the same as the dev
    // path so attributes still log somewhere. Once @sentry/nextjs is
    // added, replace this branch with the real Sentry.startSpan call.
    return runWithConsoleSpan(options, callback);
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
