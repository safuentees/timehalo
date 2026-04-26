import "server-only";

export interface TelemetrySpan {
  setAttribute(key: string, value: string | number | boolean): void;
}

export interface TelemetrySpanOptions {
  name: string;
  op?: string;
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

export async function withSpan<T>(
  options: TelemetrySpanOptions,
  callback: (span: TelemetrySpan) => Promise<T>,
): Promise<T> {
  if (isSentryConfigured()) {
    return runWithConsoleSpan(options, callback);
  }

  if (!isProd()) {
    return runWithConsoleSpan(options, callback);
  }

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
    throw error;
  }
}
