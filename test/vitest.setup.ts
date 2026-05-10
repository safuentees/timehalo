import { config } from "dotenv";

// Load .env so DATABASE_URL (and any other server-side env) is set
// before the prisma singleton in `src/lib/prisma.ts` constructs its
// adapter. Without this, vitest spawns with `process.env.DATABASE_URL`
// undefined → libsql falls through to a default path → that file
// has no tables and tests fail with `no such table: main.User`.
config();

// Swap to the dedicated test Turso DB so fixtures don't wipe prod.
// `DATABASE_TEST_URL` + `TURSO_TEST_AUTH_TOKEN` live in `.env`; the
// test DB was forked from prod via `turso db create officehours-test
// --from-db officehours-prod --group production` so it has the same
// schema. Tests rebuild rows via `createTestHost` / `wipeTransientState`
// before each run — no manual seeding required.
//
// Hard guard: if `DATABASE_TEST_URL` is absent OR resolves to the prod
// URL, fail loudly. Tests must NEVER touch prod — fixtures call
// `purgeTestWorkspaces` / `safeTearDownByHandle` which would wipe
// real workspaces.
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

