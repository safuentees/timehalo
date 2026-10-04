
import { config } from "dotenv";
config(); // load DATABASE_URL from .env before Prisma initializes

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { hash } from "bcryptjs";
import { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE } from "./test-constants";

export { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE };

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({
      url: process.env.DATABASE_URL || "file:./prisma/dev.db",
    }),
  });

  try {
    const passwordHash = await hash(TEST_PASSWORD, 10);

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
    await prisma.workspace.deleteMany({
      where: { slug: `${TEST_HANDLE}-personal` },
    });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
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
    await prisma.eventType.create({
      data: {
        workspaceId: ws.id,
        slug: TEST_HANDLE,
        name: "15 minutes",
        durationMins: 15,
        durationMinsList: JSON.stringify([15]),
        hosts: { create: { userId: created.id, isFixed: true } },
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
