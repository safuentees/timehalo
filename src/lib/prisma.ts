// Prisma singleton for Next.js
// Docs: https://www.prisma.io/docs/orm/more/troubleshooting/nextjs
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set the libsql:// URL for Turso in .env.",
    );
  }
  const adapter = new PrismaLibSql({
    url,
    // Required for remote libsql URLs (libsql://<db>-<org>.turso.io).
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
