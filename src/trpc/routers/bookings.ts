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
const REMINDER_LEAD_MS = 60 * 60 * 1000;

const bookingConfirmationInputSchema = z.object({
  handle: z.string().min(1),
  bookingUid: z.string().min(1),
});

export const bookings = router({
  create: publicProcedure
    .use(createRateLimitMiddleware("bookings.create", 10, "1 m"))
    .input(bookingInputSchema)
    .mutation(async ({ input, ctx }) =>
      withSpan(
        {
          name: "bookings.create",
          op: "booking.write",
          attributes: {
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

          const resolvedEventType = await resolveEventTypeForHandle(
            input.handle,
          );

          let effectiveDurationMinutes: number;
          if (!resolvedEventType) {
            effectiveDurationMinutes =
              input.durationMinutes ?? SLOT_MINUTES;
          } else {
            const choices = resolveDurationChoices(resolvedEventType);
            if (input.durationMinutes === undefined) {
              effectiveDurationMinutes = resolvedEventType.durationMins;
            } else if (choices.includes(input.durationMinutes)) {
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

          const operationId = crypto.randomUUID();
          span.setAttribute("operationId", operationId);

          const referrer = ctx.cookies.get(`oh_ref_${input.handle}`) ?? null;
          if (referrer) span.setAttribute("referrer", referrer);

          try {
            const booking = await prisma.$transaction(async (tx) => {
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
                  workspaceId,
                  actor: "VISITOR",
                  action: "CREATED",
                  data: {
                    hostId: pickedHostId,
                    eventTypeId,
                    handle: input.handle,
                    visitorName: input.visitorName,
                    visitorEmail: input.visitorEmail,
                    question: input.question ?? null,
                    slotStart: created.slotStart.toISOString(),
                    slotEnd: created.slotEnd.toISOString(),
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
                console.error("[bookings.create] bumpRecentAssignments", err);
              }
            }

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

            await scheduleCalendarWrite({
              payload: {
                action: "create",
                bookingPublicUid: booking.publicUid,
              },
              referenceUid: `${booking.publicUid}:calendarWrite:create`,
            });

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
            if (cause instanceof TRPCError) throw cause;

            if (
              cause instanceof Prisma.PrismaClientKnownRequestError &&
              cause.code === "P2002"
            ) {
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
            maxAttempts: true,
            lastError: true,
            lastResponseStatus: true,
          },
        }),
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
            lastResponseStatus: true,
          },
        }),
      ]);

      let rescheduledFrom: { publicUid: string; slotStart: Date } | null = null;
      if (booking.rescheduledFromUid) {
        const prior = await prisma.booking.findUnique({
          where: { publicUid: booking.rescheduledFromUid },
          select: { publicUid: true, slotStart: true },
        });
        rescheduledFrom = prior;
      }

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
                  previousIdempotencyKey: target.idempotencyKey,
                },
                operationId,
              },
            });

            return target;
          });

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

          await cancelPendingTask({
            referenceUid: `${result.publicUid}:email:booking-reminder:visitor`,
            type: TASK_TYPE_EMAIL_SEND,
          });
          await cancelPendingWorkflowTasks(result.publicUid);

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
              workspaceId: true,
              visitorName: true,
              visitorEmail: true,
              question: true,
              slotStart: true,
              slotEnd: true,
              referrer: true,
              visitorTimezone: true,
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

          const originalDurationMs =
            original.slotEnd.getTime() - original.slotStart.getTime();
          const durationMs =
            originalDurationMs > 0
              ? originalDurationMs
              : SLOT_MINUTES * 60_000;
          const newSlotEnd = new Date(newSlotStart.getTime() + durationMs);

          try {
            const created = await prisma.$transaction(async (tx) => {
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

            await cancelPendingTask({
              referenceUid: `${original.publicUid}:email:booking-reminder:visitor`,
              type: TASK_TYPE_EMAIL_SEND,
            });
            await cancelPendingWorkflowTasks(original.publicUid);
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

  listForHost: privateProcedure.query(async ({ ctx }) => {
    const workspaceId = await resolveActiveWorkspaceId(
      ctx.user.id,
      ctx.activeWorkspaceSlug,
    );
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

  queue: privateProcedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* ({ ctx, signal }) {
      const enabled = await isFeatureEnabled("live-queue", ctx.user.id);
      if (!enabled) return;

      const workspaceId = await resolveActiveWorkspaceId(
        ctx.user.id,
        ctx.activeWorkspaceSlug,
      );
      if (!workspaceId) return;

      const iterable = iterateBookingEvents(
        ctx.user.id,
        workspaceId,
        signal!,
      );
      for await (const [event] of iterable) {
        const e = event as BookingBusEvent;
        yield tracked(`${e.bookingPublicUid}:${e.type}`, e);
      }
    }),
});
