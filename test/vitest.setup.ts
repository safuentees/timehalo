import { config } from "dotenv";

config();

const testUrl = process.env.DATABASE_TEST_URL;
const prodUrl = process.env.DATABASE_URL;
if (!testUrl) {
  throw new Error(
    "DATABASE_TEST_URL is required for vitest. Add it to .env (libsql://officehours-test-...turso.io).",
  );
}
if (testUrl === prodUrl) {
  throw new Error(
    "DATABASE_TEST_URL must differ from DATABASE_URL. Tests must run against a separate Turso DB.",
  );
}
process.env.DATABASE_URL = testUrl;
process.env.TURSO_AUTH_TOKEN = process.env.TURSO_TEST_AUTH_TOKEN ?? "";

