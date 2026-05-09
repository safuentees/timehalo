import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { planForUser } from "@/lib/billing";
import { isAdminHandle } from "@/lib/admin";
import { getEnabledFeatures } from "@/lib/feature-flags";
import {
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "@/lib/onboarding";
import { handleSchema } from "@/lib/register-schema";
import { scheduleEmailSend } from "@/lib/tasks";
import { timezoneSchema } from "@/lib/timezone";
import {
  durationsListSchema,
  parseDurationsList,
  resolveDurationChoices,
} from "@/lib/durations";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

// SQLite has no native array type so onboardingManualSteps is stored as
// a JSON string. Parse defensively: malformed cell, non-array payload,
// or a value the canonical step list doesn't recognise (legacy id from
// a future schema rollback) all collapse to an empty array. The UI
// treats `manuallyDone: []` as "user hasn't marked share-link yet" —
// the safe / inert state on a parse failure.
function parseManualSteps(raw: string): OnboardingStepId[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is OnboardingStepId =>
      (ONBOARDING_STEP_IDS as readonly string[]).includes(v),
    );
  } catch {
    return [];
  }
}

export const users = router({
  // "Me" projection. Settings forms read handle/timezone/email; the
  // top-bar avatar menu reads name/image/isAdmin. Combined into one
  // call so the dashboard pays a single network hop. `isAdmin` is
  // computed against OFFICEHOURS_ADMIN_HANDLES via isAdminHandle —
  // server-only check, never trust a client-supplied flag.
  me: privateProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: {
        id: true,
        handle: true,
        timezone: true,
        email: true,
        name: true,
        image: true,
        // B.PT43 — onboarding checklist state. Was localStorage-only;
        // moved to the User row so SSR can read it. Parsed manualSteps
        // is a string-array stored as JSON because SQLite has no
        // native array type. Defensive parse: malformed cell → empty.
        onboardingDismissed: true,
        onboardingManualSteps: true,
      },
    });
    // B.PT158 — visitor-selectable duration list. Lives on the host's
    // primary EventType (slug === handle). Pulled in the `me` query so
    // /profile can render the durations editor with one network hop;
    // /h/[handle] reads its own copy via the public `getByHandle` /
    // `bookings.create` paths. The `findFirst` (not findUnique) covers
    // pre-handle-set users — magic-link / GitHub OAuth bootstrap defers
    // EventType creation until handle is set, so during that window
    // the host has no row yet. `null` cleanly degrades the editor to
    // disabled.
    const eventType = user.handle
      ? await prisma.eventType.findFirst({
          where: { slug: user.handle, hosts: { some: { userId: user.id } } },
          select: { id: true, durationMins: true, durationMinsList: true },
        })
      : null;
    return {
      ...user,
      isAdmin: isAdminHandle(user.handle),
      onboardingManualSteps: parseManualSteps(user.onboardingManualSteps),
      durations: {
        defaultMinutes: eventType?.durationMins ?? 15,
        list: eventType ? parseDurationsList(eventType.durationMinsList) : [],
      },
    };
  }),

  // B.PT43 — persist onboarding checklist state. Replaces the
  // localStorage shape (`officehours.onboarding.{hide,manual}`) with
  // a server-side write so the values are server-readable on next
  // SSR pass + persist across browsers + devices. Both fields are
  // optional on the input — caller sends only what changed
  // (dismiss button → `dismissed: true`; mark-done → updated
  // `manualSteps` array). Server validates step ids against the
  // canonical list and de-duplicates.
  setOnboardingState: privateProcedure
    .input(
      z
        .object({
          dismissed: z.boolean().optional(),
          manualSteps: z.array(z.enum(ONBOARDING_STEP_IDS)).optional(),
        })
        .refine(
          (v) => v.dismissed !== undefined || v.manualSteps !== undefined,
          { message: "At least one of dismissed / manualSteps required" },
        ),
    )
    .mutation(async ({ input, ctx }) => {
      const data: {
        onboardingDismissed?: boolean;
        onboardingManualSteps?: string;
      } = {};
      if (input.dismissed !== undefined)
        data.onboardingDismissed = input.dismissed;
      if (input.manualSteps !== undefined) {
        // De-dup + sort for a stable on-disk representation.
        const unique = Array.from(new Set(input.manualSteps)).sort();
        data.onboardingManualSteps = JSON.stringify(unique);
      }
      await prisma.user.update({ where: { id: ctx.user.id }, data });
      return { ok: true as const };
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
      // B.PT158 — visitor's effective duration choice list. Pulled
      // from the host's primary EventType (slug === handle). When the
      // host hasn't configured a durations list, `resolveDurationChoices`
      // collapses to `[durationMins]` so the chip strip renders a
      // single-row default.
      const eventType = await prisma.eventType.findFirst({
        where: { slug: input.handle, hosts: { some: { userId: user.id } } },
        select: { durationMins: true, durationMinsList: true },
      });
      const durationChoices = eventType
        ? resolveDurationChoices(eventType)
        : [15];
      const defaultDurationMinutes = eventType?.durationMins ?? 15;
      return { ...user, durationChoices, defaultDurationMinutes };
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

  // B.PT158 — set the visitor-selectable duration list on the host's
  // primary EventType (slug === handle). Empty array clears the list
  // (visitor sees only `durationMins`). Schema-side dedup + sort means
  // the on-disk row is canonical regardless of input order.
  //
  // NOT_FOUND when the host has no primary EventType yet — the
  // bootstrapUserWorkspace path defers EventType creation until
  // handle is set; calling this before handle setup is a programming
  // error (the /profile editor disables in that state via the empty
  // `durations` shape on `users.me`).
  setDurationsList: privateProcedure
    .input(z.object({ minutes: durationsListSchema }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { handle: true },
      });
      if (!user.handle) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set your public handle before configuring durations.",
        });
      }
      const eventType = await prisma.eventType.findFirst({
        where: {
          slug: user.handle,
          hosts: { some: { userId: ctx.user.id } },
        },
        select: { id: true },
      });
      if (!eventType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No event type found for your handle.",
        });
      }
      // `durationsListSchema.transform` already dedup+sorted the input;
      // we just JSON.stringify the canonical shape onto the row.
      await prisma.eventType.update({
        where: { id: eventType.id },
        data: { durationMinsList: JSON.stringify(input.minutes) },
      });
      return { minutes: input.minutes };
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

    // B.PT83 — explicit cascade cleanup before user.delete().
    // `@prisma/adapter-libsql` doesn't reliably honor SQLite FK
    // cascades (called out in `.claude/rules/testing.md` + replicated
    // in `e2e/seed-test-user.ts`). Trusting the schema's `onDelete:
    // Cascade` left orphan rows behind — most visibly Memberships in
    // OTHER workspaces (the workspace's owner sees the deleted user
    // still in their member list). Wrap the whole thing in a
    // transaction so the cleanup commits atomically with the user
    // deletion.
    //
    // Order matters:
    //   1. Drop owned Workspaces FIRST. The Workspace cascade picks
    //      up its OWN children (memberships, invitations, bookings,
    //      api keys, webhooks, audit, slug history, subscription) —
    //      those tables don't have direct User FKs, so they need
    //      the workspace as the cascade root. (Cascade reliability
    //      from Workspace down is more reliable than from User down
    //      because the level is shallower.)
    //   2. Drop the user's Membership rows in workspaces they don't
    //      own. Visible bug from QA-6: orphan rows with `user: null`
    //      in `listMembers` output.
    //   3. Delete the user. Remaining direct children (Account,
    //      Session, Authenticator, AvailabilityRange, EventTypeHost,
    //      UserFeatures, CalendarCredential, Booking-as-host) cascade
    //      from the User row — those have always worked because the
    //      typical access path (sign-in, slot generation) runs
    //      through them in the moment, exposing any failure quickly.
    await prisma.$transaction(async (tx) => {
      await tx.workspace.deleteMany({ where: { ownerId: ctx.user.id } });
      await tx.membership.deleteMany({ where: { userId: ctx.user.id } });
      await tx.user.delete({ where: { id: ctx.user.id } });
    });

    return { ok: true as const };
  }),
});
