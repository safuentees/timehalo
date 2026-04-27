import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { withSpan } from "@/lib/observability";
import { hashPassword } from "@/lib/password";
import { handleSchema, registerInputSchema } from "@/lib/register-schema";
import {
  createRateLimitMiddleware,
  publicProcedure,
  router,
} from "@/trpc/trpc";

const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "availability",
  "bookings",
  "h",
  "login",
  "me",
  "profile",
  "register",
  "root",
  "settings",
  "www",
]);

function uniqueConstraintIncludes(cause: unknown, field: "email" | "handle") {
  if (
    !(cause instanceof Prisma.PrismaClientKnownRequestError) ||
    cause.code !== "P2002"
  ) {
    return false;
  }

  const target = cause.meta?.target;
  if (Array.isArray(target)) {
    return target.some((item) => item === field);
  }
  return typeof target === "string" && target.includes(field);
}

function handleConflict(message = "That handle is taken. Pick another.") {
  return new TRPCError({
    code: "CONFLICT",
    message,
  });
}

function emailConflict() {
  return new TRPCError({
    code: "CONFLICT",
    message: "That email is already registered.",
  });
}

export const auth = router({
  handleAvailability: publicProcedure
    .input(z.object({ handle: handleSchema }))
    .query(async ({ input }) => {
      if (RESERVED_HANDLES.has(input.handle)) {
        return { available: false as const };
      }

      const existing = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true },
      });

      return { available: existing === null };
    }),

  register: publicProcedure
    .use(createRateLimitMiddleware("auth.register", 5, "1 m"))
    .input(registerInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "auth.register",
          op: "user.write",
          attributes: {
            handle: input.handle,
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async () => {
          if (RESERVED_HANDLES.has(input.handle)) {
            throw handleConflict();
          }

          const existingEmail = await prisma.user.findUnique({
            where: { email: input.email },
            select: { id: true },
          });
          if (existingEmail) {
            throw emailConflict();
          }

          const existingHandle = await prisma.user.findUnique({
            where: { handle: input.handle },
            select: { id: true },
          });
          if (existingHandle) {
            throw handleConflict();
          }

          const passwordHash = await hashPassword(input.password);

          try {
            return await prisma.user.create({
              data: {
                email: input.email,
                handle: input.handle,
                passwordHash,
              },
              select: {
                id: true,
                email: true,
                handle: true,
              },
            });
          } catch (cause) {
            if (uniqueConstraintIncludes(cause, "email")) {
              throw emailConflict();
            }
            if (uniqueConstraintIncludes(cause, "handle")) {
              throw handleConflict();
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not create your account. Try again.",
              cause,
            });
          }
        },
      ),
    ),
});
