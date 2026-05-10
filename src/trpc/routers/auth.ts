import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { withSpan } from "@/lib/observability";
import { hashPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import {
  derivePlaceholderHandle,
  handleSchema,
  registerInputSchema,
} from "@/lib/register-schema";
import { DEFAULT_AVAILABILITY_ROWS } from "@/lib/schedule";
import { personalWorkspaceSlugFor } from "@/lib/workspaces";
import { DEFAULT_REMINDER_WORKFLOW } from "@/lib/workflows";
import {
  OTP_CODE_LENGTH,
  OTP_LOCKOUT_WINDOW,
  OTP_MAX_ATTEMPTS,
  OTP_SEND_RATE_LIMIT,
  OTP_SEND_RATE_WINDOW,
  OTP_TTL_SECONDS,
  OTP_VERIFY_RATE_LIMIT,
  OTP_VERIFY_RATE_WINDOW,
} from "@/lib/otp";
import { generateOtpCode, otpExpiresAt } from "@/lib/otp-server";
import { createRatelimit } from "@/lib/rate-limit";
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

async function createHostAccount(input: {
  email: string;
  password: string;
}) {
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
          emailVerified: new Date(),
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
          durationMinsList: JSON.stringify([15]),
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
}

const otpVerifyLockout = createRatelimit(
  OTP_MAX_ATTEMPTS,
  OTP_LOCKOUT_WINDOW,
);

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
        async () => createHostAccount(input),
      ),
    ),

  sendRegisterOtp: publicProcedure
    .use(
      createRateLimitMiddleware(
        "auth.sendRegisterOtp",
        OTP_SEND_RATE_LIMIT,
        OTP_SEND_RATE_WINDOW,
      ),
    )
    .input(registerInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "auth.sendRegisterOtp",
          op: "auth.otp.send",
          attributes: {
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async () => {
          const email = input.email;

          const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (existing) {
            throw emailConflict();
          }

          const code = generateOtpCode();
          const expires = otpExpiresAt();

          await prisma.$transaction([
            prisma.emailOtpToken.deleteMany({
              where: { identifier: email },
            }),
            prisma.emailOtpToken.create({
              data: {
                identifier: email,
                token: code,
                expires,
              },
            }),
          ]);

          const result = await sendEmail({
            to: email,
            template: "register-otp",
            props: {
              code,
              expiryMinutes: Math.round(OTP_TTL_SECONDS / 60),
              appName: "Officehours",
            },
          });
          if (!result.ok) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                result.reason === "no-key"
                  ? "Email is not configured. Try again later."
                  : "Could not send the verification email. Try again.",
            });
          }

          return {
            ok: true as const,
            expiresInSeconds: OTP_TTL_SECONDS,
          };
        },
      ),
    ),

  verifyRegisterOtp: publicProcedure
    .use(
      createRateLimitMiddleware(
        "auth.verifyRegisterOtp",
        OTP_VERIFY_RATE_LIMIT,
        OTP_VERIFY_RATE_WINDOW,
      ),
    )
    .input(
      registerInputSchema.extend({
        code: z
          .string()
          .trim()
          .length(OTP_CODE_LENGTH, `Enter the ${OTP_CODE_LENGTH}-digit code.`)
          .regex(/^\d+$/, "Code must be digits only."),
      }),
    )
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "auth.verifyRegisterOtp",
          op: "auth.otp.verify",
          attributes: {
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async () => {
          const email = input.email;

          const token = await prisma.emailOtpToken.findUnique({
            where: {
              identifier_token: {
                identifier: email,
                token: input.code,
              },
            },
            select: { expires: true },
          });

          if (!token) {
            const lockout = await otpVerifyLockout.limit(
              `auth.verifyRegisterOtp:lockout:${email}`,
            );
            if (!lockout.success) {
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message:
                  "Too many failed attempts. Try again in a few hours.",
              });
            }
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid code. Check your email and try again.",
            });
          }

          if (token.expires.getTime() < Date.now()) {
            await prisma.emailOtpToken.delete({
              where: {
                identifier_token: {
                  identifier: email,
                  token: input.code,
                },
              },
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "That code has expired. Request a new one and try again.",
            });
          }

          const user = await createHostAccount({
            email,
            password: input.password,
          });

          await prisma.emailOtpToken.deleteMany({
            where: { identifier: email },
          });

          return user;
        },
      ),
    ),
});
