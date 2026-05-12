import { Prisma } from "@/generated/prisma/client";

export function isUniqueConstraintError(cause: unknown): boolean {
  if (cause instanceof Prisma.PrismaClientKnownRequestError) {
    if (cause.code === "P2002") return true;
    if (
      typeof cause.message === "string" &&
      cause.message.includes("UNIQUE constraint failed")
    ) {
      return true;
    }
  }
  if (
    cause instanceof Error &&
    typeof cause.message === "string" &&
    cause.message.includes("UNIQUE constraint failed")
  ) {
    return true;
  }
  return false;
}
