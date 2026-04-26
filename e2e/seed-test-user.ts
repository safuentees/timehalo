// Seed script for the hydration tests — creates a known test user
// with a known password. Runs via tsx (so full Prisma client +
// bcryptjs support, unlike Playwright's own test runtime which
// chokes on the generated Prisma client's CJS shim).
//
// Invoked from playwright.config.ts globalSetup. Idempotent — wipes
// the test user first, recreates fresh. Tests use TEST_EMAIL +
// TEST_PASSWORD to log in via the credentials form.

import { config } from "dotenv";
config(); // load DATABASE_URL from .env before Prisma initializes

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { hash } from "bcryptjs";

export const TEST_EMAIL = "hydration-e2e@test.local";
export const TEST_PASSWORD = "test-password-hydration-1234";
export const TEST_HANDLE = "hydration-e2e";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({
      url: process.env.DATABASE_URL || "file:./prisma/dev.db",
    }),
  });

  try {
    const passwordHash = await hash(TEST_PASSWORD, 10);
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        handle: TEST_HANDLE,
        availabilityRanges: {
          create: [
            { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: "WEDNESDAY", startTime: "10:00", endTime: "16:00" },
          ],
        },
      },
    });
    console.log(`[seed] test user created: ${TEST_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
