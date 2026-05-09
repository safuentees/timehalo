import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DayOfWeek } from "@/generated/prisma/enums";
import { generateUpcomingSlots } from "@/lib/schedule";
import {
  fetchHostBusyTimes,
  subtractBusyTimes,
} from "@/lib/calendar";
import { resolveDurationChoices } from "@/lib/durations";
import { resolveEventTypeForHandle } from "@/lib/event-types";
import { durationMinutesSchema } from "@/lib/durations";
import { privateProcedure, publicProcedure, router } from "@/trpc/trpc";

const DAY_KEY_TO_ENUM = {
  mon: DayOfWeek.MONDAY,
  tue: DayOfWeek.TUESDAY,
  wed: DayOfWeek.WEDNESDAY,
  thu: DayOfWeek.THURSDAY,
  fri: DayOfWeek.FRIDAY,
  sat: DayOfWeek.SATURDAY,
  sun: DayOfWeek.SUNDAY,
} as const;
type DayKey = keyof typeof DAY_KEY_TO_ENUM;

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const rangeSchema = z
  .object({
    from: z.string().regex(timeRegex, "HH:MM"),
    to: z.string().regex(timeRegex, "HH:MM"),
  })
  .refine((r) => r.from < r.to, {
    message: "End must be after start",
    path: ["to"],
  });
const daySchema = z.object({
  enabled: z.boolean(),
  ranges: z.array(rangeSchema),
});
const scheduleInputSchema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
});

export const schedule = router({
  get: privateProcedure.query(async ({ ctx }) => {
    return await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }),

  save: privateProcedure
    .input(scheduleInputSchema)
    .mutation(async ({ input, ctx }) => {
      const rows = (Object.entries(input) as [DayKey, typeof input.mon][])
        .filter(([, day]) => day.enabled && day.ranges.length > 0)
        .flatMap(([key, day]) =>
          day.ranges.map((r) => ({
            userId: ctx.user.id,
            dayOfWeek: DAY_KEY_TO_ENUM[key],
            startTime: r.from,
            endTime: r.to,
          })),
        );

      try {
        await prisma.$transaction([
          prisma.availabilityRange.deleteMany({
            where: { userId: ctx.user.id },
          }),
          prisma.availabilityRange.createMany({ data: rows }),
        ]);
      } catch (cause) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your schedule. Try again.",
          cause,
        });
      }

      return { count: rows.length };
    }),

  getUpcomingSlots: publicProcedure
    .input(
      z.object({
        handle: z.string(),
        days: z.number().int().min(1).max(14).default(7),
        durationMinutes: durationMinutesSchema.optional(),
      }),
    )
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true, timezone: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const eventType = await resolveEventTypeForHandle(input.handle);
      const choices = eventType ? resolveDurationChoices(eventType) : [];
      let effectiveDurationMinutes: number;
      if (!eventType) {
        effectiveDurationMinutes = input.durationMinutes ?? 15;
      } else if (choices.length === 0) {
        return [];
      } else if (input.durationMinutes === undefined) {
        effectiveDurationMinutes = eventType.durationMins;
      } else if (choices.includes(input.durationMinutes)) {
        effectiveDurationMinutes = input.durationMinutes;
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That duration isn't available for this host.",
        });
      }

      const ranges = await prisma.availabilityRange.findMany({
        where: { userId: user.id },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });

      const allSlots = generateUpcomingSlots({
        ranges,
        from: new Date(),
        days: input.days,
        stepMinutes: 15,
        eventDurationMinutes: effectiveDurationMinutes,
        hostTimezone: user.timezone,
      });

      if (allSlots.length === 0) {
        return [];
      }

      const horizonStart = new Date(allSlots[0].start);
      const horizonEnd = new Date(allSlots[allSlots.length - 1].end);
      const busy = await fetchHostBusyTimes({
        hostId: user.id,
        from: horizonStart,
        to: horizonEnd,
      });
      const slots = subtractBusyTimes(allSlots, busy);

      if (slots.length === 0) {
        return [];
      }

      const bookings = await prisma.booking.findMany({
        where: {
          hostId: user.id,
          deleted: false,
          slotStart: { lte: new Date(slots[slots.length - 1].end) },
          slotEnd: { gte: new Date(slots[0].start) },
        },
        select: {
          slotStart: true,
          slotEnd: true,
        },
      });

      const bookingRanges = bookings.map((b) => ({
        start: b.slotStart.getTime(),
        end: b.slotEnd.getTime(),
      }));

      return slots.map((slot) => {
        const slotStartMs = new Date(slot.start).getTime();
        const slotEndMs = new Date(slot.end).getTime();
        const taken = bookingRanges.some(
          (b) => slotStartMs < b.end && slotEndMs > b.start,
        );
        const status: "open" | "taken" = taken ? "taken" : "open";

        return {
          ...slot,
          status,
        };
      });
    }),
});
