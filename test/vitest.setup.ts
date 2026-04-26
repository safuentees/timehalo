import { config } from "dotenv";

// Load .env so DATABASE_URL (and any other server-side env) is set
// before the prisma singleton in `src/lib/prisma.ts` constructs its
// adapter. Without this, vitest spawns with `process.env.DATABASE_URL`
// undefined → libsql falls through to a default path → that file
// has no tables and tests fail with `no such table: main.User`.
config();
