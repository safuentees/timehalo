import "server-only";
import { env } from "@/env";

// Leveled structured logger. One line per event, stable JSON shape,
// pipe-friendly to anything that ingests JSONL (Axiom, Datadog,
// CloudWatch, Logflare). dub uses Axiom (apps/web/lib/axiom/server.ts:
// 29-39); the principle is the same: human-readable JSON shape that
// turns up in a search later.
//
// Routing decision matrix:
//   NODE_ENV=production && no Sentry DSN  → silent
//   NODE_ENV=production && Sentry DSN     → info / warn / error emit
//   else (dev / test / preview)            → debug+ all emit
//
// Why silent in unconfigured prod: a Vercel deploy without
// observability infra shouldn't spam stdout — log lines without a
// sink are wasted bytes. Same gate observability.ts uses.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

export type Logger = {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
};

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevelFor(): number {
  if (env.NODE_ENV === "production") {
    if (!env.NEXT_PUBLIC_SENTRY_DSN) return Number.POSITIVE_INFINITY;
    return LEVEL_RANK.info;
  }
  return LEVEL_RANK.debug;
}

function emit(
  level: Level,
  name: string,
  message: string,
  fields?: Fields,
): void {
  if (LEVEL_RANK[level] < minLevelFor()) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    name,
    msg: message,
    ...(fields ?? {}),
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Create a logger scoped to a name (e.g. "email", "cron",
 * "telemetry"). Each emitted line includes `name` so a log search
 * can filter by subsystem.
 */
export function createLogger(name: string): Logger {
  return {
    debug: (message, fields) => emit("debug", name, message, fields),
    info: (message, fields) => emit("info", name, message, fields),
    warn: (message, fields) => emit("warn", name, message, fields),
    error: (message, fields) => emit("error", name, message, fields),
  };
}

/** Default app-level logger. Use `createLogger("subsystem")` for narrower scopes. */
export const logger = createLogger("officehours");
