import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

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
