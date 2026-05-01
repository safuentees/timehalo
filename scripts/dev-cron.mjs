
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const envPath = join(repoRoot, ".env");

function readEnvVar(key) {
  const fromShell = process.env[key];
  if (fromShell) return fromShell;
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return undefined;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

const cronSecret = readEnvVar("CRON_SECRET");
if (!cronSecret) {
  console.error(
    "[dev:cron] CRON_SECRET not set in .env or shell — cron route will 401. " +
      "Add a value to .env and restart this script.",
  );
  process.exit(1);
}

const port = process.env.PORT ?? "3001";
const intervalMs = Number(process.env.CRON_INTERVAL_MS ?? 10_000);
const url = `http://localhost:${port}/api/cron/process-tasks`;

let backoffMs = intervalMs;
let stopping = false;

function ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

async function tick() {
  if (stopping) return;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (err) {
    if (backoffMs < 30_000) {
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron ${ts()}] connection failed (${message}); retrying in ${backoffMs}ms`);
    return;
  }

  backoffMs = intervalMs;

  if (res.status === 401) {
    console.error(`[cron ${ts()}] 401 Unauthorized — CRON_SECRET mismatch with the running server. Restart the server after editing .env.`);
    return;
  }
  if (!res.ok) {
    console.error(`[cron ${ts()}] HTTP ${res.status} ${res.statusText}`);
    return;
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return;
  }
  const processed = payload?.processed ?? 0;
  if (processed > 0) {
    const succeeded = payload?.succeeded ?? 0;
    const failed = payload?.failed ?? 0;
    console.log(
      `[cron ${ts()}] processed=${processed} succeeded=${succeeded} failed=${failed}`,
    );
  }
}

console.log(
  `[dev:cron] polling ${url} every ${intervalMs}ms — Ctrl+C to stop`,
);

let timer = setTimeout(loop, 0);
async function loop() {
  await tick();
  if (stopping) return;
  timer = setTimeout(loop, backoffMs);
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  console.log("[dev:cron] stopped");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
