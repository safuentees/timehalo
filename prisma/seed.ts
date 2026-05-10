import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

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
