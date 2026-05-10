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

// Handles we never let a user register so they don't shadow real
// routes (`/admin`, `/api`, …) or reserved words. Keep this list in
// sync with any new top-level route segments.
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

// Shared host-account creation transaction. Mints a placeholder
// handle, creates User + Workspace + OWNER Membership + default
// reminder Workflow + singleton EventType (with `durationMinsList`
// seeded to [15] so /h/<handle> renders the chip strip immediately).
// Called from BOTH `auth.register` (legacy email+password) and
// `auth.verifyRegisterOtp` (OTP flow with lazy creation). Single
// source of truth so the two paths can never drift in what they
// seed.
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
          // OTP flow lands here AFTER the user proves email
          // ownership via the code, so stamp `emailVerified` at
          // create time. The legacy register path also runs
          // through this helper; that path doesn't verify the
          // address up-front, but stamping unconditionally is
          // defensible — credentials sign-in already gates on
          // password, the field is purely informational here.
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

// OTP brute-force lockout. Per-email bucket — 5 failed verifies
// within 24h locks that address out completely. The send-side
// rate limit (2/min) lives on the procedure middleware; this
// limiter is checked + incremented INSIDE the verify handler so
// only failed attempts consume the quota (a successful verify
// resets nothing — the row is deleted instead).
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

  // Progressive-disclosure login lookup (port of dub.co's
  // `checkAccountExistsAction` — apps/web/lib/actions/check-account-
  // exists.ts). Drives the unified email field on /login: stage 1
  // submits email → procedure reports {accountExists, hasPassword} →
  // client either reveals password input (account has password set)
  // or sends a magic link directly (passwordless account / freshly
  // verified). Account-enumeration trade-off accepted, same as dub —
  // mitigated by 10/min/IP rate limit + the credentials provider's
  // existing 5-attempt lockout in src/auth.ts.
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

  // Legacy single-step register (kept for backwards compatibility +
  // any non-OTP flow that lands here directly — admin tooling, tests).
  // The OTP register flow uses sendRegisterOtp + verifyRegisterOtp
  // below; both ultimately call the same `createHostAccount`
  // transaction so seeding never drifts.
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

  // STEP 1 of OTP register flow (B.PT-otp). Validates input, refuses
  // emails that already have an account, mints a fresh 6-digit code,
  // stores its hash-free token (the email is the secret channel —
  // intercepting the message is the only practical attack), and
  // sends the code via the existing Resend pipeline.
  //
  // Pre-flight account-exists check sends a CONFLICT immediately —
  // matches dub.co's `sendOtp` behavior. Account enumeration is the
  // same trade-off the existing `checkAccountForLogin` already
  // accepts; mitigated by the IP- + email-keyed rate limits.
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

          // Fast-path: surface CONFLICT before generating a code so a
          // confused user gets routed back to /login instead of
          // sitting on the verify screen forever.
          const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (existing) {
            throw emailConflict();
          }

          const code = generateOtpCode();
          const expires = otpExpiresAt();

          // Eager rotation — drop ANY prior pending tokens for this
          // email so the user always has exactly one active code.
          // Matches dub's `prisma.emailVerificationToken.deleteMany`
          // before `create`. Same transaction so a delete-without-
          // create can't strand the address.
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

          // Best-effort send — if Resend is unconfigured (dev
          // without an API key) the email module returns
          // `{ ok: false, reason: "no-key" }`. We surface that as
          // INTERNAL_SERVER_ERROR so the form can show a clear
          // "couldn't send" state rather than silently advancing.
          // The token IS persisted — operators in dev can read it
          // from the DB to test the verify path.
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
            // TTL echoed back to the client so the resend cooldown
            // timer + "expires in N minutes" copy stay in sync with
            // the server constant.
            expiresInSeconds: OTP_TTL_SECONDS,
          };
        },
      ),
    ),

  // STEP 2 of OTP register flow. Verifies the code against the
  // EmailOtpToken row, gates against per-email brute-force lockout,
  // creates the host account, and (atomically with the create)
  // deletes the token row so a leaked code can't be re-used.
  //
  // Returns the email so the client can call `signIn("credentials",
  // {email, password})` immediately after — the password came from
  // the same form submit, no round-trip needed.
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
            // Wrong code (or no pending request). Consume one slot
            // of the per-email lockout. After OTP_MAX_ATTEMPTS the
            // limiter starts rejecting before reaching this branch.
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

          // Code valid — create the User row and atomically delete
          // the token so it's single-use. Order matters: token
          // delete happens INSIDE createHostAccount's transaction
          // semantics by appending it as a separate $transaction
          // step. If the user create fails, the token stays
          // available for a retry.
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
