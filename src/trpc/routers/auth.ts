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
          // B.PT285 — handle dropped from the form (dub.co pattern).
          // Mint a placeholder handle (`u-<5char>`) here so the
          // unique non-null `handle` column + downstream workspace +
          // eventType slug seeding all succeed atomically. The user
          // claims a real handle at /onboarding/handle via
          // `auth.claimHandle`. Collision rate is ~1 in 60M per
          // attempt; we retry up to 5 times before giving up.
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
            // Atomic User + Workspace + OWNER Membership. Booking
            // writes stamp a non-null workspaceId, so every host has
            // to own one from sign-up onward — same pair-shape as
            // workspaces.create, in the same transaction so a partial
            // commit never leaves a host without a workspace.
            //
            // Slug uses the placeholder handle. The user can claim a
            // real handle later via `auth.claimHandle` which updates
            // User.handle + Workspace.slug + EventType.slug
            // atomically.
            return await prisma.$transaction(async (tx) => {
              const user = await tx.user.create({
                data: {
                  email: input.email,
                  handle: placeholderHandle,
                  passwordHash,
                  // Seed Mon-Fri 9-5 default ranges so the host's
                  // public page is immediately bookable and the
                  // onboarding "draw weekly hours" step auto-checks.
                  // Mirrors cal.com (UserRepository.create →
                  // schedules.create → availability.createMany).
                  // Without this, the form's pre-filled visual default
                  // starts isDirty=false → save button gated → ranges
                  // never persisted.
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
              // Seed the default 1h reminder workflow so the host can
              // edit it from /settings → Workflows. The
              // bookings.create + bookings.reschedule paths detect the
              // workflow's existence and skip their hardcoded reminder
              // enqueue, so the visitor never receives the reminder
              // twice. See hasMatchingReminderWorkflow + B4.
              await tx.workflow.create({
                data: {
                  userId: user.id,
                  ...DEFAULT_REMINDER_WORKFLOW,
                },
              });
              // Seed singleton EventType (B2) — slug = handle, the user
              // themselves as the only fixed host. /h/<handle> resolves
              // to this row. Multi-host event types are an explicit
              // caller-mints-rows action; default new users start in
              // single-host mode same as before B2.
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
