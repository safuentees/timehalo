import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { withSpan } from "@/lib/observability";
import { hashPassword } from "@/lib/password";
import {
  derivePlaceholderHandle,
  handleSchema,
  registerInputSchema,
} from "@/lib/register-schema";
import { DEFAULT_AVAILABILITY_ROWS } from "@/lib/schedule";
import { personalWorkspaceSlugFor } from "@/lib/workspaces";
import { DEFAULT_REMINDER_WORKFLOW } from "@/lib/workflows";
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

  checkAccountForLogin: publicProcedure
    .use(createRateLimitMiddleware("auth.checkAccount", 10, "1 m"))
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const email = input.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        select: { passwordHash: true },
      });
      return {
        accountExists: user !== null,
        hasPassword: !!user?.passwordHash,
      };
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
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async () => {
          let placeholderHandle = derivePlaceholderHandle();
          for (let attempt = 0; attempt < 5; attempt++) {
            const taken = await prisma.user.findUnique({
              where: { handle: placeholderHandle },
              select: { id: true },
            });
            if (!taken) break;
            placeholderHandle = derivePlaceholderHandle();
          }

          const existingEmail = await prisma.user.findUnique({
            where: { email: input.email },
            select: { id: true },
          });
          if (existingEmail) {
            throw emailConflict();
          }

          const passwordHash = await hashPassword(input.password);

          try {
            return await prisma.$transaction(async (tx) => {
              const user = await tx.user.create({
                data: {
                  email: input.email,
                  handle: placeholderHandle,
                  passwordHash,
                  availabilityRanges: {
                    createMany: { data: [...DEFAULT_AVAILABILITY_ROWS] },
                  },
                },
                select: {
                  id: true,
                  email: true,
                  handle: true,
                },
              });
              const slugTaken = await tx.workspace.findUnique({
                where: { slug: placeholderHandle },
                select: { id: true },
              });
              const workspace = await tx.workspace.create({
                data: {
                  slug: slugTaken
                    ? personalWorkspaceSlugFor(user.id)
                    : placeholderHandle,
                  name: "Personal",
                  ownerId: user.id,
                },
                select: { id: true },
              });
              await tx.membership.create({
                data: {
                  workspaceId: workspace.id,
                  userId: user.id,
                  role: "OWNER",
                },
              });
              await tx.workflow.create({
                data: {
                  userId: user.id,
                  ...DEFAULT_REMINDER_WORKFLOW,
                },
              });
              const eventType = await tx.eventType.create({
                data: {
                  workspaceId: workspace.id,
                  slug: placeholderHandle,
                  name: placeholderHandle,
                  durationMins: 15,
                },
                select: { id: true },
              });
              await tx.eventTypeHost.create({
                data: {
                  eventTypeId: eventType.id,
                  userId: user.id,
                  isFixed: true,
                  priority: 2,
                  weight: 1,
                  recentAssignments: 0,
                },
              });
              return user;
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
