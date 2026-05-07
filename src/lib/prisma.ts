// Prisma singleton for Next.js
// Docs: https://www.prisma.io/docs/orm/more/troubleshooting/nextjs
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL || "file:./prisma/dev.db",
    // Required when DATABASE_URL is a remote libsql URL
    // (libsql://<db>-<org>.turso.io). Undefined for the local
    // file:./prisma/dev.db path — the adapter ignores it then.
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
