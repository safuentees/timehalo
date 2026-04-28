import { TRPCError, tracked } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { generateUpcomingSlots } from "@/lib/schedule";
import { bookingInputSchema } from "@/lib/booking-schema";
import { withSpan } from "@/lib/observability";
import { timezoneSchema } from "@/lib/timezone";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  cancelPendingTask,
  findActiveSubscriptionsForEvent,
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

          const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);

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
          const resolvedEventType = await resolveEventTypeForHandle(
            input.handle,
          );
          let pickedHostId = host.id;
          if (resolvedEventType && resolvedEventType.hosts.length > 1) {
            const conflictingHosts = await prisma.booking.findMany({
              where: {
                eventTypeId: resolvedEventType.id,
                slotStart,
                deleted: false,
              },
              select: { hostId: true },
            });
            const excludeHostIds = new Set(
              conflictingHosts.map((b) => b.hostId),
            );
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

              const slotCollision = await tx.booking.findFirst({
                where: { hostId: pickedHostId, slotStart, deleted: false },
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
                console.error("[bookings.create] bumpRecentAssignments", err);
              }
            }

            // Fan out the booking.created event to active webhooks. This
            // intentionally runs OUTSIDE the $transaction — webhook delivery
            // is best-effort, async, and a delivery-side failure must NOT
            // roll back the booking write the visitor just confirmed.
            // Same pattern as cal.com's bookings → scheduleTrigger flow
            // (packages/features/webhooks/lib/scheduleTrigger.ts).
            const subscriptions = await findActiveSubscriptionsForEvent(
              host.id,
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
            const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

            // Live queue fan-out — fires the host's SSE channel (see
            // src/trpc/bus.ts) so any open dashboard tab gets the event
            // in <100ms with no polling. Synchronous emit, no await; the
            // bus is in-memory.
            emitBookingEvent({
              type: "created",
              bookingPublicUid: booking.publicUid,
              hostId: host.id,
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
          // the cancel the host just confirmed.
          const subscriptions = await findActiveSubscriptionsForEvent(
            ctx.user.id,
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

          emitBookingEvent({
            type: "cancelled",
            bookingPublicUid: result.publicUid,
            hostId: ctx.user.id,
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

          const newSlotEnd = new Date(
            newSlotStart.getTime() + SLOT_MINUTES * 60_000,
          );

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

              const slotCollision = await tx.booking.findFirst({
                where: {
                  hostId: host.id,
                  slotStart: newSlotStart,
                  deleted: false,
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
            // uids so receivers can stitch the chain.
            const subscriptions = await findActiveSubscriptionsForEvent(
              host.id,
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
              env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

            // Both bus events fire so the host's live queue reflects
            // the swap immediately — old row "cancelled", new row
            // "created" with a rescheduledFromUid hint visible to
            // dashboard listeners.
            emitBookingEvent({
              type: "cancelled",
              bookingPublicUid: original.publicUid,
              hostId: host.id,
              visitorName: original.visitorName,
              slotStart: original.slotStart.toISOString(),
              occurredAt: new Date().toISOString(),
            });
            emitBookingEvent({
              type: "created",
              bookingPublicUid: created.publicUid,
              hostId: host.id,
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

  // Host-side: every booking against this host, split by upcoming vs
  // past based on slotStart. No "pending/confirmed" yet — the data
  // model has no status field; per the project guide we don't add it
  // until a story actually demands the confirm flow.
  listForHost: privateProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await prisma.booking.findMany({
      where: { hostId: ctx.user.id, deleted: false },
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
  // a booking is created or cancelled for this host. Pattern follows
  // tRPC v11's recommended SSE shape: privateProcedure + async
  // generator + AbortSignal-driven cleanup + `tracked()` for
  // reconnect recovery (Context7-verified against the v11
  // subscriptions docs).
  //
  // No `hostId` input — scoped to ctx.user.id from session. The bus
  // channel is `host:${ctx.user.id}` (see src/trpc/bus.ts).
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

      // signal! is non-null inside subscription procedures — tRPC v11
      // wires the request abort signal automatically.
      const iterable = iterateBookingEvents(ctx.user.id, signal!);
      for await (const [event] of iterable) {
        const e = event as BookingBusEvent;
        // tracked() ID format `${publicUid}:${type}` — unique per
        // event, deterministic, lets the SSE client recover lastEventId
        // semantics if we add a persistent log later.
        yield tracked(`${e.bookingPublicUid}:${e.type}`, e);
      }
    }),
});
