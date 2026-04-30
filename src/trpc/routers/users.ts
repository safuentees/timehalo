import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { planForUser } from "@/lib/billing";
import { getEnabledFeatures } from "@/lib/feature-flags";
import { handleSchema } from "@/lib/register-schema";
import { scheduleEmailSend } from "@/lib/tasks";
import { timezoneSchema } from "@/lib/timezone";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

export const users = router({
  // Minimal "me" projection — just the fields the settings form needs.
  // Returning the whole User record would leak passwordHash, attempts, etc.
  me: privateProcedure.query(async ({ ctx }) => {
    return await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      // email is included so the settings danger-zone confirms against
      // the live account email rather than re-querying. Private
      // procedure — only the logged-in user sees their own row.
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
      },
    });
  }),

  // Per-user feature flag map. Returns every known flag's resolved
  // state so the client can gate UI without a network roundtrip per
  // flag check. Cached client-side via the standard react-query
  // staleTime; flags that flip on the server take effect on the next
  // refetch (or SSR boundary).
  featureFlags: privateProcedure.query(async ({ ctx }) => {
    return getEnabledFeatures(ctx.user.id);
  }),

  // B.PT18 — per-user plan resolver. User-scoped surfaces (workflows,
  // future user-scoped webhooks) gate on the user's primary workspace
  // plan via `planForUser` server-side. This procedure exposes the
  // same resolution to the client so UI lock-icons stay consistent
  // with the procedure-level gate. Distinct from
  // `billing.currentPlan({ slug })` which keys off a specific
  // workspace's Subscription — that's the right shape for
  // workspace-scoped surfaces (api-keys, billing card, member-cap),
  // but workflows aren't workspace-scoped today, so the workspace
  // lookup was misleading the user about which switch flips the lock.
  plan: privateProcedure.query(async ({ ctx }) => {
    return { plan: await planForUser(ctx.user.id) };
  }),

  getByHandle: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        // timezone is public — visitors need it to label the slot
        // picker ("Times shown in Pacific time"). No PII; no email/hash.
        select: {
          id: true,
          name: true,
          handle: true,
          image: true,
          timezone: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  // Atomic handle update with unique-constraint error mapping:
  // if another user already owns the handle, throw CONFLICT so the
  // client can attach the error to the handle field instead of showing
  // a generic 500.
  setHandle: privateProcedure
    .input(z.object({ handle: handleSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: ctx.user.id },
            data: { handle: input.handle },
          });
          // B2: ensure a singleton EventType exists for the new
          // handle. Magic-link / GitHub OAuth users skip auth.register
          // entirely; bootstrapUserWorkspace seeds the workspace +
          // membership but defers EventType creation until handle is
          // set (slug needs a handle). This is the catch-up.
          const workspace = await tx.workspace.findFirst({
            where: { ownerId: ctx.user.id },
            select: { id: true },
            orderBy: { createdAt: "asc" },
          });
          if (workspace) {
            const existing = await tx.eventType.findUnique({
              where: {
                workspaceId_slug: {
                  workspaceId: workspace.id,
                  slug: input.handle,
                },
              },
              select: { id: true },
            });
            if (!existing) {
              const eventType = await tx.eventType.create({
                data: {
                  workspaceId: workspace.id,
                  slug: input.handle,
                  name: input.handle,
                  durationMins: 15,
                },
                select: { id: true },
              });
              await tx.eventTypeHost.upsert({
                where: {
                  eventTypeId_userId: {
                    eventTypeId: eventType.id,
                    userId: ctx.user.id,
                  },
                },
                create: {
                  eventTypeId: eventType.id,
                  userId: ctx.user.id,
                  isFixed: true,
                  priority: 2,
                  weight: 1,
                  recentAssignments: 0,
                },
                update: {},
              });
            }
          }
        });
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That handle is taken. Pick another.",
            cause,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your handle. Try again.",
          cause,
        });
      }
      return { handle: input.handle };
    }),

  // Update the host's IANA timezone. Validated through `timezoneSchema`
  // which round-trips the string through Intl.DateTimeFormat — typos
  // and fixed-offset zones get rejected with a precise error.
  setTimezone: privateProcedure
    .input(z.object({ timezone: timezoneSchema }))
    .mutation(async ({ input, ctx }) => {
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
      });
      return { timezone: input.timezone };
    }),

  // Account deletion. Cascades through every relation onDelete:
  // Cascade (Account, Session, AvailabilityRange, Booking,
  // WebhookSubscription, UserFeatures, Authenticator). BookingAudit
  // explicitly does NOT have a FK to Booking (see schema.prisma) —
  // audit rows survive deletion and stay queryable by bookingUid.
  //
  // Email confirmation is enqueued BEFORE the delete commits. The
  // email payload is self-contained (template + props serialized as
  // JSON in the Task row) so it survives the User row's deletion.
  // If the cron later finds the user gone, the email still sends
  // because nothing in runEmailSend reads back from User.
  //
  // The handler does not call signOut() — that's a client-side
  // concern (the session cookie lives in the browser, not in this
  // procedure's view). The DeleteAccountDialog awaits this mutation
  // then triggers next-auth signOut() on the client.
  deleteAccount: privateProcedure.mutation(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { email: true, name: true, handle: true },
    });

    const hostName = user.name ?? user.handle ?? "Officehours user";
    const operationId = crypto.randomUUID();

    await scheduleEmailSend({
      payload: {
        to: user.email,
        template: "account-deleted",
        props: {
          hostName,
          deletedAtIso: new Date().toISOString(),
        },
      },
      // Bind to userId + operationId — re-running the procedure (not
      // idempotent on the user row, but the email enqueue is) won't
      // double-send.
      referenceUid: `user:${ctx.user.id}:account-deleted:${operationId}`,
    });

    await prisma.user.delete({ where: { id: ctx.user.id } });

    return { ok: true as const };
  }),
});
