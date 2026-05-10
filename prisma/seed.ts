import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Production guard: refuse to seed when NODE_ENV is "production".
// Prisma's `migrate deploy` (the prod path, see vercel.json.buildCommand)
// does NOT auto-run the seed, but `migrate reset` + `db seed` do — and
// PRODUCTION-READINESS A6 wants a defense-in-depth check so a future
// agent adding real seed data can't accidentally insert rows into prod
// via either of those paths. The check throws BEFORE the Prisma client
// is constructed so misuse fails loud rather than half-running.
if (process.env.NODE_ENV === "production") {
  console.error(
    "[seed] refusing to run with NODE_ENV=production. " +
      "Seeds are dev/test only — prod data should come from real users."
  );
  process.exit(1);
}

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

// Seed is intentionally empty for now. The MVP user story (host signs
// up + sets handle + draws a window) is exercised by manually creating
// a host through /register and editing /availability — no fixture data
// required. Add seeds here when a story needs deterministic test data.
async function main() {
  console.log("Nothing to seed. Sign up at /register to create a host.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
