import { TRPCError, tracked } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { generateUpcomingSlots } from "@/lib/schedule";
import { bookingInputSchema } from "@/lib/booking-schema";
import { resolveDurationChoices } from "@/lib/durations";
import { withSpan } from "@/lib/observability";
import { timezoneSchema } from "@/lib/timezone";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  cancelPendingTask,
  findActiveSubscriptionsForEvent,
  scheduleCalendarWrite,
  scheduleEmailSend,
  scheduleWebhookDelivery,
  TASK_TYPE_EMAIL_SEND,
} from "@/lib/tasks";
import {
  cancelPendingWorkflowTasks,
  dispatchWorkflows,
  hasMatchingReminderWorkflow,
  type WorkflowBookingContext,
} from "@/lib/workflows";
import {
  bumpRecentAssignments,
  resolveEventTypeForHandle,
} from "@/lib/event-types";
import { selectHost } from "@/lib/round-robin";
import { findBusyHostIds } from "@/lib/calendar";
import { resolveActiveWorkspaceId } from "@/lib/active-workspace-server";
import { createLogger } from "@/lib/logger";

const log = createLogger("bookings");
import {
  emitBookingEvent,
  iterateBookingEvents,
  type BookingBusEvent,
} from "@/trpc/bus";
import {
  createRateLimitMiddleware,
  privateProcedure,
  publicProcedure,
  router,
} from "@/trpc/trpc";

const SLOT_MINUTES = 15;
// How far in advance to fire the visitor reminder email. cal.com's
// workflow defaults to 60 minutes pre-event; matches a "I'm about to
// jump on a call" mental model without spamming the inbox.
const REMINDER_LEAD_MS = 60 * 60 * 1000;

const bookingConfirmationInputSchema = z.object({
  handle: z.string().min(1),
  bookingUid: z.string().min(1),
});

export const bookings = router({
  // Public: any visitor can book. Validates that the slot actually
  // falls within the host's availability (matching the client's
  // advertised list), then writes the booking. A `@@unique([hostId,
  // slotStart])` constraint on the table stops double-books at the DB
  // level — Prisma's P2002 maps to TRPCError CONFLICT so the form can
  // show a friendly "that slot was just taken" message.
  create: publicProcedure
    // 10 requests / minute / IP — matches cal.com's `core` bucket
    // (packages/lib/rateLimit.ts). Generous enough for a real visitor
    // who hits validation errors and retries; tight enough to throttle
    // a curl loop or a runaway script.
    .use(createRateLimitMiddleware("bookings.create", 10, "1 m"))
    .input(bookingInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.create",
          op: "booking.write",
          attributes: {
            // Same idempotencyKey + ipIdentifier the limiter buckets
            // by — lets log lines correlate with the rate-limit
            // headers and the BookingAudit row's operationId field.
            idempotencyKey: input.idempotencyKey,
            ipIdentifier: ctx.ipIdentifier,
            handle: input.handle,
          },
        },
        async (span) => {
          const bookingSelect = {
            id: true,
            publicUid: true,
            slotStart: true,
            slotEnd: true,
          } as const;

          // Idempotency short-circuit. If the visitor's form has already
          // produced a booking for this UUID, return it as-is without
          // re-running validation. Skips the "slot is in the past" check
          // when a retry happens late, and skips a wasteful slot scan.
          // Mirrors cal.com Booking.idempotencyKey semantics.
          //
          // Note: filter deleted=false. If the booking with this key was
          // soft-deleted (host cancelled), don't return it as if the
          // submit succeeded — let the user create a new one. (When
          // soft-delete fires, idempotencyKey is also nulled out, so the
          // findUnique below would miss anyway. This filter is belt-and-
          // suspenders.)
          const existingByKey = await prisma.booking.findFirst({
            where: { idempotencyKey: input.idempotencyKey, deleted: false },
            select: bookingSelect,
          });
          if (existingByKey) {
            span.setAttribute("idempotencyHit", true);
            return existingByKey;
          }

          const host = await prisma.user.findUnique({
            where: { handle: input.handle },
            select: {
              id: true,
              name: true,
              handle: true,
              timezone: true,
              email: true,
              // Primary workspace — the oldest workspace the host
              // owns, mirrored onto the booking so reads can scope by
              // workspace without joining through User. Backfill +
              // auth.register guarantee the array is non-empty.
              ownedWorkspaces: {
                select: { id: true },
                take: 1,
                orderBy: { createdAt: "asc" },
              },
            },
          });
          if (!host) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Host not found",
            });
          }
          const workspaceId = host.ownedWorkspaces[0]?.id;
          if (!workspaceId) {
            // Defense in depth — schema + backfill guarantee a
            // workspace exists. Surface as 500 so a missed migration
            // alerts instead of silently picking up a default.
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Host has no workspace",
            });
          }

          const slotStart = new Date(input.slotStart);
          if (Number.isNaN(slotStart.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid slot timestamp",
            });
          }
          if (slotStart.getTime() <= Date.now()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That slot is in the past",
            });
          }

          // Reuse the same generator the public page uses so the
          // server's definition of "available" is identical to the
          // client's. Scanning 14 days forward covers any slot the
          // visitor could plausibly have been shown.
          const ranges = await prisma.availabilityRange.findMany({
            where: { userId: host.id },
            select: { dayOfWeek: true, startTime: true, endTime: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          });
          const upcoming = generateUpcomingSlots({
            ranges,
            from: new Date(),
            days: 14,
            stepMinutes: SLOT_MINUTES,
            hostTimezone: host.timezone,
          });
          const isValid = upcoming.some((s) => s.start === input.slotStart);
          if (!isValid) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That slot isn't available anymore",
            });
          }

          // Round-robin pick (B2). Resolve the EventType for the
          // handle, run selectHost across its host pool. For the
          // singleton-fixed case (every backfilled user) this returns
          // the host themselves — same as before. For multi-host event
          // types, the algorithm picks based on priority + weight +
          // recent-assignment count. excludeHostIds covers hosts who
          // already have a booking at this slot (the slot collision
          // check below short-circuits when the picked host conflicts,
          // but we exclude them up front to give a different host a
          // chance instead of throwing a useless CONFLICT for a
          // multi-host pool).
          //
          // B.PT275 — resolve EventType BEFORE slotEnd so we can
          // compute the effective duration from the visitor's pick.
          // Legacy hosts without an EventType row fall back to
          // SLOT_MINUTES (today's behaviour); modern hosts use
          // `EventType.durationMins` as the singleton default and
          // accept any duration in `durationMinsList`.
          const resolvedEventType = await resolveEventTypeForHandle(
            input.handle,
          );

          // B.PT275 / B.PT278 — compute the effective booking duration.
          //   • No EventType (legacy / pre-backfill) → SLOT_MINUTES.
          //   • EventType + non-empty choices + no input → durationMins
          //     (programmatic-call fallback; the chip strip on
          //     /h/[handle] always sends a duration).
          //   • EventType + non-empty choices + input in choices → use it.
          //   • EventType + non-empty choices + input NOT in choices →
          //     BAD_REQUEST. Belt-and-suspenders against a stale chip
          //     UI or a hand-rolled curl request.
          //   • EventType + EMPTY choices → host has no bookable
          //     durations (B.PT278). Refuse to mint the booking.
          //     Visitor's chip strip already renders the placeholder
          //     in this state, so the only way to reach here is a
          //     programmatic call.
          let effectiveDurationMinutes: number;
          if (!resolvedEventType) {
            effectiveDurationMinutes =
              input.durationMinutes ?? SLOT_MINUTES;
          } else {
            const choices = resolveDurationChoices(resolvedEventType);
            if (choices.length === 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "This host isn't accepting bookings right now.",
              });
            }
            if (input.durationMinutes === undefined) {
              effectiveDurationMinutes = resolvedEventType.durationMins;
            } else if (
              choices.some((c) => c.minutes === input.durationMinutes)
            ) {
              effectiveDurationMinutes = input.durationMinutes;
            } else {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "That duration isn't available for this host. Pick a configured duration.",
              });
            }
          }
          span.setAttribute(
            "durationMinutes",
            effectiveDurationMinutes,
          );

          const slotEnd = new Date(
            slotStart.getTime() + effectiveDurationMinutes * 60_000,
          );
          let pickedHostId = host.id;
          if (resolvedEventType && resolvedEventType.hosts.length > 1) {
            // Two distinct conflict sources, both feeding excludeHostIds:
            //
            //   (a) Officehours-internal — a different visitor already
            //       booked one of the pool members at this exact slot.
            //       The slot collision check below would catch this
            //       inside the transaction, but excluding upfront lets
            //       round-robin pick a different host instead of
            //       throwing CONFLICT for a pool that has free members.
            //
            //   (b) External calendar (B.PT12) — a host's connected
            //       Google / Outlook calendar shows them busy at this
            //       slot. Same exclude treatment so a host blocked on
            //       their personal calendar doesn't get picked. Only
            //       fired when there's actually a multi-host pool to
            //       pick across — fetching busy times for a singleton
            //       pool wastes a network call.
            const [conflictingHosts, calendarBusyHostIds] =
              await Promise.all([
                prisma.booking.findMany({
                  where: {
                    eventTypeId: resolvedEventType.id,
                    slotStart,
                    deleted: false,
                  },
                  select: { hostId: true },
                }),
                findBusyHostIds({
                  hostIds: resolvedEventType.hosts.map((h) => h.userId),
                  slotStart,
                  slotEnd,
                }),
              ]);
            const excludeHostIds = new Set<string>([
              ...conflictingHosts.map((b) => b.hostId),
              ...calendarBusyHostIds,
            ]);
            const pick = selectHost({
              hosts: resolvedEventType.hosts,
              excludeHostIds,
            });
            if (pick.kind === "selected") {
              pickedHostId = pick.hostId;
            } else {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  pick.kind === "all-conflicted"
                    ? "Every host on this event type is already booked at that slot."
                    : "No hosts configured for this event type.",
              });
            }
          }
          const eventTypeId = resolvedEventType?.id ?? null;

          // One UUID per request, shared by the audit row written below
          // and (eventually) by webhook deliveries / email tasks fired off
          // the same user action. Lets logs group every side effect of one
          // submit by `operationId`.
          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          // Attribution from the oh_ref_<handle> cookie set in proxy.ts
          // when the visitor first landed via a ?ref= link. Server-side
          // only — never trusted from the input. Mirrors dub.co's clickId
          // → conversion thread shrunk to single-host scope.
          const referrer = ctx.cookies.get(`oh_ref_${input.handle}`) ?? null;
          if (referrer) span.setAttribute("referrer", referrer);

          try {
            // $transaction(async tx => ...) — slot collision check +
            // booking write + audit row commit atomically. SQLite
            // serializes transactions, so the findFirst-then-create
            // window is race-free even under concurrent submits to the
            // same slot.
            //
            // Replaces the previous @@unique([hostId, slotStart]) +
            // P2002 catch — the unique constraint had to go to allow
            // soft-deleted rebooking. App-level enforcement is what
            // remains.
            const booking = await prisma.$transaction(async (tx) => {
              // Idempotency re-check INSIDE the transaction. The findUnique
              // before the validate-and-transact phase is the fast-path
              // optimization (skip validation when we already know we're a
              // retry). But three concurrent retries with the same key all
              // see "no row" in that fast-path lookup, then race into the
              // transaction together — without this re-check, the loser
              // would trip the slot-collision branch below and surface
              // CONFLICT instead of the existing booking. SQLite
              // serializes commits, so this lookup sees any row a prior
              // transaction wrote.
              const existingByKeyInTx = await tx.booking.findFirst({
                where: { idempotencyKey: input.idempotencyKey, deleted: false },
                select: bookingSelect,
              });
              if (existingByKeyInTx) {
                span.setAttribute("idempotencyHitInTx", true);
                return existingByKeyInTx;
              }

              // B.PT277 — range-overlap collision check. Mirrors
              // cal.com `getBusyTimes`'s `startTime: { lte: endDate },
              // endTime: { gte: startDate }` shape (BookingRepository
              // .ts:699-705) — canonical interval-overlap for a booking
              // calendar. Strict inequality on the equality boundaries
              // (`lt` instead of `lte`, `gt` instead of `gte`) so a new
              // booking can start the moment an existing one ends
              // without colliding (10:00–11:00 booking + 11:00 new =
              // back-to-back, not overlap).
              //
              // Pre-B.PT277 we matched `slotStart` for point-equality.
              // That missed adjacent overlaps — host with a 5:00 PM +
              // 2hr booking didn't block a 5:15 + 15min visitor,
              // because the slotStart values differed even though the
              // ranges overlapped. The visitor's slot picker showed
              // "open", they clicked it, the procedure committed an
              // invalid booking.
              const slotCollision = await tx.booking.findFirst({
                where: {
                  hostId: pickedHostId,
                  deleted: false,
                  slotStart: { lt: slotEnd },
                  slotEnd: { gt: slotStart },
                },
                select: { id: true },
              });
              if (slotCollision) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "Someone just grabbed that slot. Pick another.",
                });
              }

              const created = await tx.booking.create({
                data: {
                  hostId: pickedHostId,
                  workspaceId,
                  eventTypeId,
                  visitorName: input.visitorName,
                  visitorEmail: input.visitorEmail,
                  question: input.question,
                  slotStart,
                  slotEnd,
                  idempotencyKey: input.idempotencyKey,
                  referrer,
                  visitorTimezone: input.visitorTimezone ?? null,
                },
                select: bookingSelect,
              });

              await tx.bookingAudit.create({
                data: {
                  bookingUid: created.publicUid,
                  // Workspace-aware audit (B1). Denormalized at write
                  // time so workspace-level audit views don't need a
                  // join through Booking (which may be cleanup-cron-
                  // deleted by the time the audit row is queried).
                  workspaceId,
                  actor: "VISITOR",
                  action: "CREATED",
                  // Self-contained snapshot — survives the booking row's
                  // eventual deletion. Dates as ISO strings for portable JSON.
                  // hostId here is the round-robin-resolved host (which
                  // equals the handle owner for the singleton-fixed case
                  // every existing user has). eventTypeId captures which
                  // event type this booking was made against.
                  data: {
                    hostId: pickedHostId,
                    eventTypeId,
                    handle: input.handle,
                    visitorName: input.visitorName,
                    visitorEmail: input.visitorEmail,
                    question: input.question ?? null,
                    slotStart: created.slotStart.toISOString(),
                    slotEnd: created.slotEnd.toISOString(),
                    // B.PT275 — durationMinutes survives in the audit
                    // payload so downstream consumers (admin audit
                    // viewer, webhook delivery debug, future analytics)
                    // see exactly what the visitor picked even after
                    // the booking row is cleanup-cron-deleted.
                    durationMinutes: effectiveDurationMinutes,
                    idempotencyKey: input.idempotencyKey,
                    referrer,
                  },
                  operationId,
                },
              });

              return created;
            });
            span.setAttribute("bookingPublicUid", booking.publicUid);

            // Bump the round-robin lookback counter. Fires only for
            // multi-host event types — the singleton-fixed case
            // doesn't need fairness tracking. Failure is non-fatal:
            // booking already committed, the worst case is the next
            // pick weighs this assignment as if it never happened.
            if (
              eventTypeId !== null &&
              resolvedEventType &&
              resolvedEventType.hosts.length > 1
            ) {
              try {
                await bumpRecentAssignments({
                  eventTypeId,
                  userId: pickedHostId,
                });
              } catch (err) {
                // Same shape as the workflow / webhook fan-out below —
                // never roll back the booking for an analytics write.
                log.error("bookings.create bumpRecentAssignments failed", {
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }

            // Fan out the booking.created event to active webhooks. This
            // intentionally runs OUTSIDE the $transaction — webhook delivery
            // is best-effort, async, and a delivery-side failure must NOT
            // roll back the booking write the visitor just confirmed.
            // Same pattern as cal.com's bookings → scheduleTrigger flow
            // (packages/features/webhooks/lib/scheduleTrigger.ts).
            const subscriptions = await findActiveSubscriptionsForEvent(
              workspaceId,
              "booking.created",
            );
            for (const sub of subscriptions) {
              await scheduleWebhookDelivery({
                payload: {
                  webhookSubscriptionId: sub.id,
                  event: "booking.created",
                  body: {
                    event: "booking.created",
                    operationId,
                    booking: {
                      publicUid: booking.publicUid,
                      slotStart: booking.slotStart.toISOString(),
                      slotEnd: booking.slotEnd.toISOString(),
                      // B.PT275 — picked duration on the wire so
                      // webhook consumers don't have to recompute
                      // (slotEnd - slotStart) themselves.
                      durationMinutes: effectiveDurationMinutes,
                      visitorName: input.visitorName,
                      visitorEmail: input.visitorEmail,
                      question: input.question ?? null,
                    },
                    host: {
                      handle: input.handle,
                      id: host.id,
                    },
                    createdAt: new Date().toISOString(),
                  },
                },
                referenceUid: `${booking.publicUid}:booking.created:${sub.id}`,
              });
            }
            span.setAttribute("webhooksScheduled", subscriptions.length);

            // Email fan-out — visitor gets booking-created. Host already
            // has the SSE live queue + dashboard, so no host email on
            // create (cancel emails both parties since the visitor learns
            // about it asynchronously). Same pattern as webhook delivery:
            // queued via Task, processed off-path so a Resend hiccup
            // can't roll back the booking write.
            const hostName = host.name ?? host.handle ?? "your host";
            const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
            const confirmationUrl = `${appUrl}/h/${input.handle}/booked/${booking.publicUid}`;
            await scheduleEmailSend({
              payload: {
                to: input.visitorEmail,
                template: "booking-created",
                props: {
                  hostName,
                  visitorName: input.visitorName,
                  slotStartIso: booking.slotStart.toISOString(),
                  question: input.question ?? null,
                  confirmationUrl,
                },
              },
              referenceUid: `${booking.publicUid}:email:booking-created:visitor`,
            });

            // Reminder email — scheduled 1h before slotStart. The
            // existing process-tasks cron picks it up when due (Task
            // model's `scheduledAt` filter). Skip if the booking is
            // already <1h away — sending a reminder for a slot that's
            // imminent or already passed is noise. Cancel/reschedule
            // mark this row as superseded so the cron skips it.
            //
            // Suppression — A4: every user is seeded with a default
            // BEFORE_EVENT + EMAIL_VISITOR + booking-reminder workflow
            // at register time, and the workflows engine fires it via
            // dispatchWorkflows below. If that rule (or any user-edited
            // version of it) is active, skip the hardcoded enqueue so
            // the visitor doesn't receive the same reminder email twice.
            const useHardcodedReminder = !(await hasMatchingReminderWorkflow(
              host.id,
            ));
            const reminderAt = new Date(
              booking.slotStart.getTime() - REMINDER_LEAD_MS,
            );
            if (useHardcodedReminder && reminderAt.getTime() > Date.now()) {
              await scheduleEmailSend({
                payload: {
                  to: input.visitorEmail,
                  template: "booking-reminder",
                  props: {
                    hostName,
                    visitorName: input.visitorName,
                    slotStartIso: booking.slotStart.toISOString(),
                    confirmationUrl,
                  },
                },
                referenceUid: `${booking.publicUid}:email:booking-reminder:visitor`,
                scheduledAt: reminderAt,
              });
            }

            // Workflow engine (B4). User-configurable rules layer on top
            // of the hardcoded reminder above. Dispatch fires for both
            // EVENT_CREATED (immediate) and BEFORE_EVENT (scheduled at
            // slotStart - offsetMinutes) triggers.
            const workflowCtx: WorkflowBookingContext = {
              bookingPublicUid: booking.publicUid,
              hostId: host.id,
              hostName,
              hostEmail: host.email,
              hostHandle: input.handle,
              visitorName: input.visitorName,
              visitorEmail: input.visitorEmail,
              question: input.question ?? null,
              slotStartIso: booking.slotStart.toISOString(),
              slotEndIso: booking.slotEnd.toISOString(),
              operationId,
            };
            await dispatchWorkflows({
              trigger: "EVENT_CREATED",
              booking: workflowCtx,
            });
            await dispatchWorkflows({
              trigger: "BEFORE_EVENT",
              booking: workflowCtx,
            });

            // B2 — two-way calendar write. Enqueue a calendarWrite
            // Task; the cron processor resolves the host's primary
            // connected calendar and POSTs the event there. If the
            // host has no connected calendar, the cron permanently-
            // fails the row with a clear reason. Either way the
            // booking row is committed first — calendar write is a
            // best-effort side channel that never rolls back the
            // booking the visitor confirmed.
            await scheduleCalendarWrite({
              payload: {
                action: "create",
                bookingPublicUid: booking.publicUid,
              },
              referenceUid: `${booking.publicUid}:calendarWrite:create`,
            });

            // Live queue fan-out — fires the host's SSE channel (see
            // src/trpc/bus.ts) so any open dashboard tab gets the event
            // in <100ms with no polling. Synchronous emit, no await; the
            // bus is in-memory.
            emitBookingEvent({
              type: "created",
              bookingPublicUid: booking.publicUid,
              hostId: host.id,
              workspaceId,
              visitorName: input.visitorName,
              slotStart: booking.slotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });

            return booking;
          } catch (cause) {
            // Re-throw TRPCErrors as-is (slot collision from inside the
            // transaction, etc). The catch is here to wrap unknown
            // errors and the idempotencyKey race.
            if (cause instanceof TRPCError) throw cause;

            if (
              cause instanceof Prisma.PrismaClientKnownRequestError &&
              cause.code === "P2002"
            ) {
              // Only constraint left that can fire P2002: idempotencyKey.
              // Race protection — between the findFirst short-circuit and
              // the create, a parallel request with the same key landed.
              // Look it up and return it instead of throwing.
              const raced = await prisma.booking.findFirst({
                where: { idempotencyKey: input.idempotencyKey, deleted: false },
                select: bookingSelect,
              });
              if (raced) return raced;
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not create booking. Try again.",
              cause,
            });
          }
        },
      ),
    ),

  getPublicConfirmation: publicProcedure
    .input(bookingConfirmationInputSchema)
    .query(async ({ input }) => {
      const booking = await prisma.booking.findFirst({
        where: {
          publicUid: input.bookingUid,
          deleted: false,
          host: {
            handle: input.handle,
          },
        },
        select: {
          publicUid: true,
          slotStart: true,
          slotEnd: true,
          host: {
            select: {
              name: true,
              handle: true,
              image: true,
            },
          },
        },
      });

      if (!booking) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found",
        });
      }

      return booking;
    }),

  // Host-side soft-delete. Sets deleted=true, deletedAt=now(), and
  // Host-side booking detail. Returns the booking row + every
  // BookingAudit row tied to its publicUid + every pending Task
  // (reminder / workflow scheduled) so the host has a single
  // request to render the detail page. Permission: caller must be
  // the host (User.id == hostId) — workspace-member access waits
  // for B1's webhook+audit migration. Pattern reference: cal.com's
  // BookingDetailsSheet — single fetch, render side-by-side info +
  // history.
  getDetail: privateProcedure
    .input(z.object({ publicUid: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const booking = await prisma.booking.findUnique({
        where: { publicUid: input.publicUid },
        select: {
          id: true,
          publicUid: true,
          hostId: true,
          workspaceId: true,
          eventTypeId: true,
          visitorName: true,
          visitorEmail: true,
          visitorTimezone: true,
          question: true,
          slotStart: true,
          slotEnd: true,
          referrer: true,
          rescheduledFromUid: true,
          createdAt: true,
          deleted: true,
          deletedAt: true,
          host: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              timezone: true,
            },
          },
          eventType: {
            select: {
              id: true,
              slug: true,
              name: true,
              durationMins: true,
            },
          },
        },
      });
      if (!booking) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found",
        });
      }
      if (booking.hostId !== ctx.user.id) {
        // No "you don't own this" leak — same shape as a missing row
        // so an attacker can't enumerate publicUids.
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Booking not found",
        });
      }

      const [audit, pendingTasks, deliveries] = await Promise.all([
        prisma.bookingAudit.findMany({
          where: { bookingUid: booking.publicUid },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            actor: true,
            action: true,
            data: true,
            operationId: true,
            createdAt: true,
          },
        }),
        prisma.task.findMany({
          where: {
            referenceUid: { startsWith: `${booking.publicUid}:` },
            succeededAt: null,
          },
          orderBy: { scheduledAt: "asc" },
          select: {
            id: true,
            type: true,
            referenceUid: true,
            scheduledAt: true,
            attempts: true,
            // B.PT77 — `maxAttempts` lets the UI split this list into
            // "still retrying" vs "permanently failed" without a
            // second query. The cron processor stops re-running rows
            // where `attempts >= maxAttempts`, so the equality flip is
            // the host-visible "this delivery is dead" signal.
            maxAttempts: true,
            lastError: true,
            // B.PT78 — the actual HTTP response status from the last
            // attempt. Lets the UI surface "✗ 400" instead of an
            // ambiguous "Failed" — host can match against the
            // receiver's logs without context-switching.
            lastResponseStatus: true,
          },
        }),
        // A6 — historical deliveries. Closes e583bbc's deferral:
        // "the side block here shows pending Tasks but not
        // historical succeeded ones. A 'deliveries' sub-section is
        // a natural follow-up." `succeededAt: { not: null }` is the
        // open-set complement of the pendingTasks query above. New
        // first so the most-recent delivery sits at the top of the
        // host's view; an `attempts > 1` value is visible as a
        // retry tag in the UI.
        prisma.task.findMany({
          where: {
            referenceUid: { startsWith: `${booking.publicUid}:` },
            succeededAt: { not: null },
          },
          orderBy: { succeededAt: "desc" },
          select: {
            id: true,
            type: true,
            referenceUid: true,
            scheduledAt: true,
            succeededAt: true,
            attempts: true,
            // B.PT78 — surface the response code on the success path
            // too (e.g. ✓ 200 / ✓ 204) so the host can confirm what
            // the receiver actually accepted.
            lastResponseStatus: true,
          },
        }),
      ]);

      // Linked rescheduled booking (when this booking was rescheduled
      // from another). Surfaces the chain on the detail page so the
      // host can navigate. Soft-deleted ancestor rows are still shown
      // — that's the expected state for the prior leg.
      let rescheduledFrom: { publicUid: string; slotStart: Date } | null = null;
      if (booking.rescheduledFromUid) {
        const prior = await prisma.booking.findUnique({
          where: { publicUid: booking.rescheduledFromUid },
          select: { publicUid: true, slotStart: true },
        });
        rescheduledFrom = prior;
      }

      // Adjacent neighbours for prev/next nav (A5). Order by
      // slotStart with id as tiebreak. Filter `deleted: false` to
      // mirror the bookings-list invariant — cancelled rows aren't
      // navigable from the detail page either. Scoped to the
      // *booking's own* workspace (B.PT16), not the user's currently
      // active one — bookmarks must navigate inside a coherent
      // workspace regardless of which workspace happens to be
      // active. The filter touches the [workspaceId, slotStart]
      // composite index from B1.
      const [previous, next] = await Promise.all([
        prisma.booking.findFirst({
          where: {
            hostId: ctx.user.id,
            workspaceId: booking.workspaceId,
            deleted: false,
            OR: [
              { slotStart: { lt: booking.slotStart } },
              { slotStart: booking.slotStart, id: { lt: booking.id } },
            ],
          },
          orderBy: [{ slotStart: "desc" }, { id: "desc" }],
          select: { publicUid: true },
        }),
        prisma.booking.findFirst({
          where: {
            hostId: ctx.user.id,
            workspaceId: booking.workspaceId,
            deleted: false,
            OR: [
              { slotStart: { gt: booking.slotStart } },
              { slotStart: booking.slotStart, id: { gt: booking.id } },
            ],
          },
          orderBy: [{ slotStart: "asc" }, { id: "asc" }],
          select: { publicUid: true },
        }),
      ]);

      return {
        ...booking,
        audit,
        pendingTasks,
        deliveries,
        rescheduledFrom,
        previousUid: previous?.publicUid ?? null,
        nextUid: next?.publicUid ?? null,
      };
    }),

  // nulls out idempotencyKey so the cleanup window can hard-delete
  // safely AND a future booking can reuse the slot. Writes a
  // BookingAudit row in the same $transaction so audit can never
  // miss a state change. Schedules booking.cancelled webhook fan-out
  // outside the transaction (delivery failure must not roll back the
  // cancel).
  cancel: privateProcedure
    .input(z.object({ publicUid: z.string().min(1) }))
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.cancel",
          op: "booking.write",
          attributes: { publicUid: input.publicUid, hostId: ctx.user.id },
        },
        async (span) => {
          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          const result = await prisma.$transaction(async (tx) => {
            // Look up + ownership check in one query. findFirst
            // (not findUnique) so the deleted=false filter applies.
            const target = await tx.booking.findFirst({
              where: {
                publicUid: input.publicUid,
                hostId: ctx.user.id,
                deleted: false,
              },
              select: {
                id: true,
                publicUid: true,
                visitorName: true,
                visitorEmail: true,
                question: true,
                slotStart: true,
                slotEnd: true,
                hostId: true,
                workspaceId: true,
                idempotencyKey: true,
              },
            });
            if (!target) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Booking not found or already cancelled",
              });
            }

            await tx.booking.update({
              where: { id: target.id },
              data: {
                deleted: true,
                deletedAt: new Date(),
                // Free the unique index entry so a future booking
                // can reuse the key. NULL doesn't trip @unique.
                idempotencyKey: null,
              },
            });

            await tx.bookingAudit.create({
              data: {
                bookingUid: target.publicUid,
                workspaceId: target.workspaceId,
                actor: "HOST",
                action: "CANCELLED",
                data: {
                  hostId: target.hostId,
                  visitorName: target.visitorName,
                  visitorEmail: target.visitorEmail,
                  question: target.question ?? null,
                  slotStart: target.slotStart.toISOString(),
                  slotEnd: target.slotEnd.toISOString(),
                  // Capture what the previous idempotencyKey was at
                  // cancel time — useful for forensics.
                  previousIdempotencyKey: target.idempotencyKey,
                },
                operationId,
              },
            });

            return target;
          });

          // Webhook fan-out — same pattern as bookings.create. Outside
          // the transaction so a delivery-side failure can't roll back
          // the cancel the host just confirmed. Workspace-scoped (B1)
          // so every member who configured a webhook in the booking's
          // workspace gets the cancel event.
          const subscriptions = await findActiveSubscriptionsForEvent(
            result.workspaceId,
            "booking.cancelled",
          );
          for (const sub of subscriptions) {
            await scheduleWebhookDelivery({
              payload: {
                webhookSubscriptionId: sub.id,
                event: "booking.cancelled",
                body: {
                  event: "booking.cancelled",
                  operationId,
                  booking: {
                    publicUid: result.publicUid,
                    slotStart: result.slotStart.toISOString(),
                    slotEnd: result.slotEnd.toISOString(),
                    visitorName: result.visitorName,
                    visitorEmail: result.visitorEmail,
                  },
                  cancelledAt: new Date().toISOString(),
                },
              },
              referenceUid: `${result.publicUid}:booking.cancelled:${sub.id}`,
            });
          }
          span.setAttribute("webhooksScheduled", subscriptions.length);

          // Cancel any pending reminder Task. updateMany filters on
          // succeededAt: null so a reminder that already fired (e.g.
          // host cancels right after the email lands) doesn't get
          // re-marked. No-op + 0 count when no reminder was queued
          // (booking was <1h away at create time).
          await cancelPendingTask({
            referenceUid: `${result.publicUid}:email:booking-reminder:visitor`,
            type: TASK_TYPE_EMAIL_SEND,
          });
          // Cancel pending workflow tasks tied to this booking — a
          // BEFORE_EVENT rule scheduled in the future shouldn't fire
          // after the slot was cancelled. Already-succeeded tasks
          // are filtered out by the prefix-match's succeededAt:
          // null clause.
          await cancelPendingWorkflowTasks(result.publicUid);

          // Email fan-out — both parties get notified on cancel. The
          // visitor was waiting for this slot; the host gets a record
          // outside the SSE/dashboard channel so a cancellation that
          // happens while the dashboard is closed still surfaces.
          // Reference uid binds to the cancel operation, not the
          // booking publicUid, so an eventual re-booking + cancel
          // doesn't dedup against the prior round.
          const hostUser = await prisma.user.findUnique({
            where: { id: ctx.user.id },
            select: { name: true, handle: true, email: true },
          });
          const hostName =
            hostUser?.name ?? hostUser?.handle ?? "your host";
          await scheduleEmailSend({
            payload: {
              to: result.visitorEmail,
              template: "booking-cancelled",
              props: {
                hostName,
                visitorName: result.visitorName,
                slotStartIso: result.slotStart.toISOString(),
              },
            },
            referenceUid: `${result.publicUid}:email:booking-cancelled:visitor:${operationId}`,
          });
          if (hostUser?.email) {
            await scheduleEmailSend({
              payload: {
                to: hostUser.email,
                template: "booking-cancelled-host",
                props: {
                  hostName,
                  visitorName: result.visitorName,
                  visitorEmail: result.visitorEmail,
                  slotStartIso: result.slotStart.toISOString(),
                },
              },
              referenceUid: `${result.publicUid}:email:booking-cancelled:host:${operationId}`,
            });
          }

          // Workflow EVENT_CANCELLED dispatch — user-configurable
          // rules layer on top of the hardcoded cancel emails above.
          await dispatchWorkflows({
            trigger: "EVENT_CANCELLED",
            booking: {
              bookingPublicUid: result.publicUid,
              hostId: ctx.user.id,
              hostName,
              hostEmail: hostUser?.email ?? null,
              hostHandle: hostUser?.handle ?? "",
              visitorName: result.visitorName,
              visitorEmail: result.visitorEmail,
              question: result.question ?? null,
              slotStartIso: result.slotStart.toISOString(),
              slotEndIso: result.slotEnd.toISOString(),
              operationId,
            },
          });

          // B2 — calendar delete. If the booking had an external
          // event (host had a calendar connected at create time),
          // enqueue a delete Task. The cron picks the same recorded
          // credential. operationId is in the referenceUid so a
          // double-cancel race produces two distinct Task rows that
          // both attempt the delete — the adapter's 404 handling
          // makes the second one a no-op.
          await scheduleCalendarWrite({
            payload: {
              action: "delete",
              bookingPublicUid: result.publicUid,
            },
            referenceUid: `${result.publicUid}:calendarWrite:delete:${operationId}`,
          });

          emitBookingEvent({
            type: "cancelled",
            bookingPublicUid: result.publicUid,
            hostId: ctx.user.id,
            workspaceId: result.workspaceId,
            visitorName: result.visitorName,
            slotStart: result.slotStart.toISOString(),
            occurredAt: new Date().toISOString(),
          });

          return { ok: true as const, publicUid: result.publicUid };
        },
      ),
    ),

  // Visitor-driven reschedule. The publicUid is the capability —
  // anyone with the confirmation URL can reschedule their booking.
  // Same pattern as cal.com: in one transaction, soft-delete the old
  // row (audit RESCHEDULED_FROM, null idempotencyKey) and create a
  // new row pointing rescheduledFromUid → old.publicUid (audit
  // RESCHEDULED_TO). Both audit rows share the same operationId so
  // the chain is queryable in either direction.
  reschedule: publicProcedure
    .use(createRateLimitMiddleware("bookings.reschedule", 10, "1 m"))
    .input(
      z.object({
        oldPublicUid: z.string().min(1),
        newSlotStart: z.string().datetime(),
        idempotencyKey: z.string().uuid(),
        visitorTimezone: timezoneSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.reschedule",
          op: "booking.write",
          attributes: {
            oldPublicUid: input.oldPublicUid,
            idempotencyKey: input.idempotencyKey,
            ipIdentifier: ctx.ipIdentifier,
          },
        },
        async (span) => {
          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          // Idempotency short-circuit — if this idempotencyKey has
          // already produced a booking (the reschedule's NEW row),
          // return that row instead of redoing the swap.
          const existingByKey = await prisma.booking.findFirst({
            where: {
              idempotencyKey: input.idempotencyKey,
              deleted: false,
            },
            select: {
              id: true,
              publicUid: true,
              slotStart: true,
              slotEnd: true,
              hostId: true,
            },
          });
          if (existingByKey) {
            span.setAttribute("idempotencyHit", true);
            const host = await prisma.user.findUnique({
              where: { id: existingByKey.hostId },
              select: { handle: true },
            });
            return {
              publicUid: existingByKey.publicUid,
              handle: host?.handle ?? null,
            };
          }

          const original = await prisma.booking.findFirst({
            where: {
              publicUid: input.oldPublicUid,
              deleted: false,
            },
            select: {
              id: true,
              publicUid: true,
              hostId: true,
              // The new booking inherits the original's workspace —
              // a reschedule stays inside the same collaboration unit.
              workspaceId: true,
              visitorName: true,
              visitorEmail: true,
              question: true,
              slotStart: true,
              slotEnd: true,
              referrer: true,
              visitorTimezone: true,
              // B2 — needed by the reschedule flow to decide whether
              // to enqueue a calendar delete for the old slot.
              externalCalendarEventId: true,
              externalCalendarCredentialId: true,
            },
          });
          if (!original) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Booking not found or already cancelled",
            });
          }

          const host = await prisma.user.findUnique({
            where: { id: original.hostId },
            select: {
              id: true,
              name: true,
              handle: true,
              timezone: true,
              email: true,
            },
          });
          if (!host || !host.handle) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Host no longer exists",
            });
          }

          const newSlotStart = new Date(input.newSlotStart);
          if (Number.isNaN(newSlotStart.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid slot timestamp",
            });
          }
          if (newSlotStart.getTime() <= Date.now()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That slot is in the past",
            });
          }
          if (newSlotStart.getTime() === original.slotStart.getTime()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Pick a different slot to reschedule to",
            });
          }

          const ranges = await prisma.availabilityRange.findMany({
            where: { userId: host.id },
            select: { dayOfWeek: true, startTime: true, endTime: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          });
          const upcoming = generateUpcomingSlots({
            ranges,
            from: new Date(),
            days: 14,
            stepMinutes: SLOT_MINUTES,
            hostTimezone: host.timezone,
          });
          const isValid = upcoming.some(
            (s) => s.start === input.newSlotStart,
          );
          if (!isValid) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That slot isn't available anymore",
            });
          }

          // B.PT275 — preserve the original booking's duration on
          // reschedule. The visitor picks a new slot but keeps the same
          // length — same as cal.com's reschedule semantics. Falls back
          // to SLOT_MINUTES if the original somehow has a degenerate
          // (non-positive) range.
          const originalDurationMs =
            original.slotEnd.getTime() - original.slotStart.getTime();
          const durationMs =
            originalDurationMs > 0
              ? originalDurationMs
              : SLOT_MINUTES * 60_000;
          const newSlotEnd = new Date(newSlotStart.getTime() + durationMs);

          try {
            const created = await prisma.$transaction(async (tx) => {
              // Re-check inside the tx — same race protection the
              // bookings.create handler runs.
              const existingInTx = await tx.booking.findFirst({
                where: {
                  idempotencyKey: input.idempotencyKey,
                  deleted: false,
                },
                select: {
                  id: true,
                  publicUid: true,
                  hostId: true,
                },
              });
              if (existingInTx) {
                span.setAttribute("idempotencyHitInTx", true);
                return existingInTx;
              }

              // B.PT277 — range-overlap, same shape as bookings.create.
              // Reschedule preserves the original duration server-side
              // (newSlotEnd derived above), so the predicate covers
              // adjacent-overlap reschedules just like create does.
              const slotCollision = await tx.booking.findFirst({
                where: {
                  hostId: host.id,
                  deleted: false,
                  slotStart: { lt: newSlotEnd },
                  slotEnd: { gt: newSlotStart },
                  // Exclude the source booking itself — rescheduling a
                  // 10:00 → 10:30 booking with the same id obviously
                  // overlaps itself; that's not a conflict.
                  id: { not: original.id },
                },
                select: { id: true },
              });
              if (slotCollision) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message:
                    "Someone just grabbed that slot. Pick another.",
                });
              }

              // Cancel the original — soft delete + null idempotency.
              await tx.booking.update({
                where: { id: original.id },
                data: {
                  deleted: true,
                  deletedAt: new Date(),
                  idempotencyKey: null,
                },
              });

              await tx.bookingAudit.create({
                data: {
                  bookingUid: original.publicUid,
                  workspaceId: original.workspaceId,
                  actor: "VISITOR",
                  action: "RESCHEDULED_FROM",
                  data: {
                    rescheduledToSlotStart: newSlotStart.toISOString(),
                    previousSlotStart: original.slotStart.toISOString(),
                    visitorEmail: original.visitorEmail,
                  },
                  operationId,
                },
              });

              const newBooking = await tx.booking.create({
                data: {
                  hostId: host.id,
                  workspaceId: original.workspaceId,
                  visitorName: original.visitorName,
                  visitorEmail: original.visitorEmail,
                  question: original.question,
                  slotStart: newSlotStart,
                  slotEnd: newSlotEnd,
                  idempotencyKey: input.idempotencyKey,
                  referrer: original.referrer,
                  visitorTimezone:
                    input.visitorTimezone ?? original.visitorTimezone,
                  rescheduledFromUid: original.publicUid,
                },
                select: {
                  id: true,
                  publicUid: true,
                  hostId: true,
                  slotStart: true,
                  slotEnd: true,
                },
              });

              await tx.bookingAudit.create({
                data: {
                  bookingUid: newBooking.publicUid,
                  // The new booking inherits the original's
                  // workspace — reschedule stays inside the
                  // same collaboration unit.
                  workspaceId: original.workspaceId,
                  actor: "VISITOR",
                  action: "RESCHEDULED_TO",
                  data: {
                    rescheduledFromUid: original.publicUid,
                    previousSlotStart: original.slotStart.toISOString(),
                    newSlotStart: newSlotStart.toISOString(),
                    visitorEmail: original.visitorEmail,
                  },
                  operationId,
                },
              });

              return newBooking;
            });
            span.setAttribute("newBookingPublicUid", created.publicUid);

            // Webhook + email + bus fan-out (outside the tx, like
            // create + cancel). booking.rescheduled carries both
            // uids so receivers can stitch the chain. Workspace-
            // scoped (B1) — same workspace as the original booking.
            const subscriptions = await findActiveSubscriptionsForEvent(
              original.workspaceId,
              "booking.rescheduled",
            );
            for (const sub of subscriptions) {
              await scheduleWebhookDelivery({
                payload: {
                  webhookSubscriptionId: sub.id,
                  event: "booking.rescheduled",
                  body: {
                    event: "booking.rescheduled",
                    operationId,
                    booking: {
                      publicUid: created.publicUid,
                      slotStart: newSlotStart.toISOString(),
                      slotEnd: newSlotEnd.toISOString(),
                      visitorName: original.visitorName,
                      visitorEmail: original.visitorEmail,
                      rescheduledFromUid: original.publicUid,
                    },
                    previous: {
                      publicUid: original.publicUid,
                      slotStart: original.slotStart.toISOString(),
                    },
                    host: { handle: host.handle, id: host.id },
                    occurredAt: new Date().toISOString(),
                  },
                },
                referenceUid: `${created.publicUid}:booking.rescheduled:${sub.id}`,
              });
            }
            span.setAttribute("webhooksScheduled", subscriptions.length);

            const hostName =
              host.name ?? host.handle ?? "your host";
            const appUrl =
              env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
            const confirmationUrl = `${appUrl}/h/${host.handle}/booked/${created.publicUid}`;
            await scheduleEmailSend({
              payload: {
                to: original.visitorEmail,
                template: "booking-rescheduled",
                props: {
                  hostName,
                  visitorName: original.visitorName,
                  oldSlotStartIso: original.slotStart.toISOString(),
                  newSlotStartIso: newSlotStart.toISOString(),
                  confirmationUrl,
                },
              },
              referenceUid: `${created.publicUid}:email:booking-rescheduled:visitor:${operationId}`,
            });

            // Reminder swap — supersede the old booking's pending
            // reminder (referenceUid is keyed to the old publicUid)
            // and schedule a fresh one for the new slot, only if the
            // new slot is still >1h out.
            await cancelPendingTask({
              referenceUid: `${original.publicUid}:email:booking-reminder:visitor`,
              type: TASK_TYPE_EMAIL_SEND,
            });
            // Workflow tasks tied to the OLD booking's publicUid
            // also get superseded — a BEFORE_EVENT rule scheduled
            // before the swap shouldn't fire after. The new booking
            // re-runs EVENT_CREATED + BEFORE_EVENT dispatches below
            // so user rules carry over to the new slot.
            await cancelPendingWorkflowTasks(original.publicUid);
            // Same A4 suppression as bookings.create: only enqueue the
            // hardcoded reminder when no matching workflow rule exists
            // for the host. The workflows engine handles it otherwise.
            const useHardcodedReminderResched =
              !(await hasMatchingReminderWorkflow(host.id));
            const newReminderAt = new Date(
              newSlotStart.getTime() - REMINDER_LEAD_MS,
            );
            if (
              useHardcodedReminderResched &&
              newReminderAt.getTime() > Date.now()
            ) {
              await scheduleEmailSend({
                payload: {
                  to: original.visitorEmail,
                  template: "booking-reminder",
                  props: {
                    hostName,
                    visitorName: original.visitorName,
                    slotStartIso: newSlotStart.toISOString(),
                    confirmationUrl,
                  },
                },
                referenceUid: `${created.publicUid}:email:booking-reminder:visitor`,
                scheduledAt: newReminderAt,
              });
            }

            // Workflow EVENT_RESCHEDULED dispatch on the new booking.
            // We also re-run BEFORE_EVENT so any "ping me 24h before"
            // rule the host has set re-arms for the new slot.
            const reschedCtx: WorkflowBookingContext = {
              bookingPublicUid: created.publicUid,
              hostId: host.id,
              hostName,
              hostEmail: host.email,
              hostHandle: host.handle,
              visitorName: original.visitorName,
              visitorEmail: original.visitorEmail,
              question: original.question ?? null,
              slotStartIso: newSlotStart.toISOString(),
              slotEndIso: newSlotEnd.toISOString(),
              operationId,
            };
            await dispatchWorkflows({
              trigger: "EVENT_RESCHEDULED",
              booking: reschedCtx,
              oldSlotStartIso: original.slotStart.toISOString(),
            });
            await dispatchWorkflows({
              trigger: "BEFORE_EVENT",
              booking: reschedCtx,
            });

            // B2 — calendar reschedule. Two-step pattern: delete
            // the old event (if it was written) and create a fresh
            // one for the new slot. We use create (not update)
            // because the new Booking row is a different entity in
            // our model — the host's calendar event id moves to
            // the new row, the old row's event is deleted. This
            // keeps cancel + create symmetric and matches cal.com's
            // reschedule flow.
            if (
              original.externalCalendarEventId &&
              original.externalCalendarCredentialId
            ) {
              await scheduleCalendarWrite({
                payload: {
                  action: "delete",
                  bookingPublicUid: original.publicUid,
                },
                referenceUid: `${original.publicUid}:calendarWrite:delete:${operationId}`,
              });
            }
            await scheduleCalendarWrite({
              payload: {
                action: "create",
                bookingPublicUid: created.publicUid,
              },
              referenceUid: `${created.publicUid}:calendarWrite:create`,
            });

            // Both bus events fire so the host's live queue reflects
            // the swap immediately — old row "cancelled", new row
            // "created" with a rescheduledFromUid hint visible to
            // dashboard listeners.
            emitBookingEvent({
              type: "cancelled",
              bookingPublicUid: original.publicUid,
              hostId: host.id,
              workspaceId: original.workspaceId,
              visitorName: original.visitorName,
              slotStart: original.slotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });
            emitBookingEvent({
              type: "created",
              bookingPublicUid: created.publicUid,
              hostId: host.id,
              // Reschedule keeps the new booking inside the same
              // workspace as the original (see the `workspaceId:
              // original.workspaceId` on the inner tx.booking.create).
              workspaceId: original.workspaceId,
              visitorName: original.visitorName,
              slotStart: newSlotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });

            return {
              publicUid: created.publicUid,
              handle: host.handle,
            };
          } catch (cause) {
            if (cause instanceof TRPCError) throw cause;
            if (
              cause instanceof Prisma.PrismaClientKnownRequestError &&
              cause.code === "P2002"
            ) {
              const raced = await prisma.booking.findFirst({
                where: {
                  idempotencyKey: input.idempotencyKey,
                  deleted: false,
                },
                select: { publicUid: true, hostId: true },
              });
              if (raced) {
                return {
                  publicUid: raced.publicUid,
                  handle: host.handle,
                };
              }
            }
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not reschedule the booking. Try again.",
              cause,
            });
          }
        },
      ),
    ),

  // Host-side: every booking the host owns inside the *active*
  // workspace, split by upcoming vs past based on slotStart. B.PT16
  // — without the workspace filter the dashboard mixes bookings
  // across every workspace the host is in, which made the topbar
  // workspace switcher misleading on `/bookings`. Schema carries
  // `Booking.workspaceId` since B1 plus a `[workspaceId, slotStart]`
  // composite index, so the filter is one column wider with no
  // additional cost. `resolveActiveWorkspaceId` falls back to the
  // host's oldest membership when the cookie is unset or stale,
  // mirroring `workspaces.list`'s `effectiveSlug` invariant.
  //
  // No "pending/confirmed" yet — the data model has no status field;
  // per the project guide we don't add it until a story actually
  // demands the confirm flow.
  listForHost: privateProcedure.query(async ({ ctx }) => {
    const workspaceId = await resolveActiveWorkspaceId(
      ctx.user.id,
      ctx.activeWorkspaceSlug,
    );
    // No memberships → empty list. The procedure must never throw on
    // this path: SSR `prefetch()` swallows thrown errors (dehydrated
    // state excludes failed queries), so a throw here would silently
    // deny the bookings list of any hydration data and force the
    // client to render the empty card on every refresh — which reads
    // as a stuck skeleton rather than the legitimate "no workspace"
    // edge case it actually is. (B.PT38 — port of `3a6ff1b`.)
    if (!workspaceId) return { upcoming: [], past: [] };
    const now = new Date();
    const rows = await prisma.booking.findMany({
      where: { hostId: ctx.user.id, workspaceId, deleted: false },
      select: {
        id: true,
        publicUid: true,
        visitorName: true,
        visitorEmail: true,
        question: true,
        slotStart: true,
        slotEnd: true,
        createdAt: true,
      },
      orderBy: { slotStart: "asc" },
    });

    const upcoming = rows.filter((b) => b.slotStart >= now);
    const past = rows.filter((b) => b.slotStart < now).reverse();
    return { upcoming, past };
  }),

  // Live queue subscription — yields BookingBusEvent objects whenever
  // a booking is created or cancelled for this host *inside the
  // user's active workspace*. Pattern follows tRPC v11's recommended
  // SSE shape: privateProcedure + async generator + AbortSignal-
  // driven cleanup + `tracked()` for reconnect recovery
  // (Context7-verified against the v11 subscriptions docs).
  //
  // Channel is `host:${ctx.user.id}:ws:${workspaceId}` (B.PT16); the
  // workspace qualifier is resolved at subscribe time from
  // `ctx.activeWorkspaceSlug`. When the user switches workspace, the
  // client tears down + reconnects via tRPC cache invalidation
  // (B.PT17) so the new connection picks up the new channel.
  //
  // `lastEventId` is provided by the SSE protocol on reconnect. We
  // currently don't replay missed events from a persistent log —
  // that would require a per-host event store. For now reconnect
  // just resumes the live stream; clients should refetch
  // bookings.listForHost on reconnect to reconcile.
  queue: privateProcedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* ({ ctx, signal }) {
      // Server-side feature flag check — kill switch for the SSE
      // bus. If `live-queue` is off, we close the connection
      // immediately rather than holding it open forever. Belt-and-
      // suspenders: the client also gates via featureFlags before
      // calling useSubscription, but the server is the source of
      // truth in case a stale client tries to bypass.
      const enabled = await isFeatureEnabled("live-queue", ctx.user.id);
      if (!enabled) return;

      const workspaceId = await resolveActiveWorkspaceId(
        ctx.user.id,
        ctx.activeWorkspaceSlug,
      );
      // No memberships → close the SSE immediately. Same defensive
      // reasoning as `listForHost`: throwing here would surface as a
      // subscription error in the client's LiveDot, which is wrong
      // for the legitimate "user has no workspace" case. (B.PT38.)
      if (!workspaceId) return;

      // signal! is non-null inside subscription procedures — tRPC v11
      // wires the request abort signal automatically.
      const iterable = iterateBookingEvents(
        ctx.user.id,
        workspaceId,
        signal!,
      );
      for await (const [event] of iterable) {
        const e = event as BookingBusEvent;
        // tracked() ID format `${publicUid}:${type}` — unique per
        // event, deterministic, lets the SSE client recover lastEventId
        // semantics if we add a persistent log later.
        yield tracked(`${e.bookingPublicUid}:${e.type}`, e);
      }
    }),
});
