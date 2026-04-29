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
import { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE } from "./test-constants";

// Re-export so callers can keep importing from this module if they want.
export { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE };

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({
      url: process.env.DATABASE_URL || "file:./prisma/dev.db",
    }),
  });

  try {
    const passwordHash = await hash(TEST_PASSWORD, 10);

    // Belt-and-braces wipe before re-seed:
    //   1) BookingAudit has no FK to Booking — won't cascade. Wipe by host.
    //   2) Booking has onDelete: Cascade on host, but adapter-libsql
    //      doesn't always honor it; explicit deleteMany is reliable.
    //   3) Tasks (e.g. enqueued reminders / webhook deliveries) — same
    //      reason; orphaned rows would otherwise leak across e2e runs.
    //   4) The booking-flow spec creates fresh bookings each run; the
    //      hydration-e2e host MUST start with zero bookings so the
    //      "first available slot" the spec picks is open.
    const existing = await prisma.user.findFirst({
      where: { email: TEST_EMAIL },
      select: { id: true },
    });
    if (existing) {
      await prisma.bookingAudit.deleteMany({
        where: {
          bookingUid: {
            in: (
              await prisma.booking.findMany({
                where: { hostId: existing.id },
                select: { publicUid: true },
              })
            ).map((b) => b.publicUid),
          },
        },
      });
      await prisma.booking.deleteMany({ where: { hostId: existing.id } });
      await prisma.task.deleteMany({});
    }
    // Cascade-on-delete on Workspace.ownerId is declared in the schema,
    // but adapter-libsql doesn't always honor SQLite FK cascades reliably.
    // Wipe the workspace explicitly first by slug, then fall through to
    // user.deleteMany.
    await prisma.workspace.deleteMany({
      where: { slug: `${TEST_HANDLE}-personal` },
    });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    // The booking flow expects every host to have a primary owned
    // workspace (B1 — `bookings.create` resolves Booking.workspaceId
    // from `host.ownedWorkspaces[0]`). Production seeds it via
    // `bootstrapUserWorkspace` on first sign-in; mirror that shape
    // here so the seeded test user can actually accept bookings.
    const created = await prisma.user.create({
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
      select: { id: true },
    });
    const ws = await prisma.workspace.create({
      data: {
        slug: `${TEST_HANDLE}-personal`,
        name: "Personal",
        ownerId: created.id,
      },
      select: { id: true },
    });
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: created.id,
        role: "OWNER",
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
