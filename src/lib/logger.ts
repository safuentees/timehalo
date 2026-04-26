import "server-only";
import { env } from "@/env";

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

export function createLogger(name: string): Logger {
  return {
    debug: (message, fields) => emit("debug", name, message, fields),
    info: (message, fields) => emit("info", name, message, fields),
    warn: (message, fields) => emit("warn", name, message, fields),
    error: (message, fields) => emit("error", name, message, fields),
  };
}

export const logger = createLogger("officehours");
