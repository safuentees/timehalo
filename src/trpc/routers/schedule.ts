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

// Form keys like "mon" map to the Prisma enum values.
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
  // Returns all AvailabilityRange rows for the logged-in user, sorted
  // by day then start time. Client groups them into the weekly form shape.
  get: privateProcedure.query(async ({ ctx }) => {
    return await prisma.availabilityRange.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }),

  // Replaces the user's whole schedule in one transaction:
  // delete all existing rows, insert the new set built from the form payload.
  // Days with enabled=false or empty ranges produce zero rows (implicitly off).
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

  // Public endpoint powering /h/[handle]. Look up the user by handle, read
  // their availability ranges, and generate back-to-back fixed-length slots
  // starting from "now" for the next N days. Past times on day 0 are skipped.
  getUpcomingSlots: publicProcedure
    .input(
      z.object({
        handle: z.string(),
        // B.PT308 — `days` is now an OPTIONAL upper-bound override.
        // Default resolution: host's `bookingHorizonDays` if set,
        // else 7 (legacy default). Hard ceiling raised to 365
        // (Cal.com's hard cap on ROLLING is similar — they allow
        // up to ~730 but most hosts stay <= 90). The visitor can
        // request fewer days than the host's horizon (e.g. for
        // prefetching the next 7 visually) but never more.
        days: z.number().int().min(1).max(365).optional(),
        // B.PT277 — visitor's picked duration. Drives slot generation
        // (`start + duration ≤ range.end`) AND the range-overlap status
        // check below. Optional: when omitted we resolve the host's
        // default duration server-side (first chip on /h/[handle]) so
        // SSR works without the client knowing the default.
        durationMinutes: durationMinutesSchema.optional(),
      }),
    )
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { handle: input.handle },
        select: { id: true, timezone: true, bookingHorizonDays: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // B.PT308 — effective horizon: host's `bookingHorizonDays` if
      // set, else 7-day legacy default. Visitor's `days` arg (if
      // present) acts as a `min` clamp — they can ask for fewer
      // days, never more.
      const hostHorizon = user.bookingHorizonDays ?? 7;
      const requested = input.days ?? hostHorizon;
      const effectiveDays = Math.min(requested, hostHorizon);

      // B.PT277 — resolve the EventType so we can validate the picked
      // duration AND fall back to the host's default. Legacy hosts
      // without an EventType keep behaving as today (15-min step,
      // single duration).
      const eventType = await resolveEventTypeForHandle(input.handle);
      const choices = eventType ? resolveDurationChoices(eventType) : [];
      let effectiveDurationMinutes: number;
      if (!eventType) {
        effectiveDurationMinutes = input.durationMinutes ?? 15;
      } else if (choices.length === 0) {
        // Host explicitly cleared the list (B.PT278) — no bookable
        // durations. Return zero slots so /h/[handle] renders the
        // "not taking bookings" placeholder consistently.
        return [];
      } else if (input.durationMinutes === undefined) {
        effectiveDurationMinutes = eventType.durationMins;
      } else if (choices.some((c) => c.minutes === input.durationMinutes)) {
        effectiveDurationMinutes = input.durationMinutes;
      } else {
        // Stale chip strip / direct API call with an off-list duration.
        // Bookings.create would reject the same value; align early so
        // the visitor doesn't see slots they can't book.
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
        days: effectiveDays,
        stepMinutes: 15,
        eventDurationMinutes: effectiveDurationMinutes,
        hostTimezone: user.timezone,
      });

      if (allSlots.length === 0) {
        return [];
      }

      // Pull busy ranges from every selected calendar across the
      // host's connected providers. Any slot overlapping a busy
      // range gets dropped (B3). When no calendar is connected
      // fetchHostBusyTimes returns [] and subtractBusyTimes is a
      // no-op pass-through.
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

      // B.PT277 — pull every booking that could overlap the slot
      // horizon. The query mirrors cal.com's `getBusyTimes` shape
      // (`startTime: { lte: endDate }, endTime: { gte: startDate }`):
      // canonical interval-overlap predicate. Pre-B.PT277 we used
      // `slotStart` point-equality, which missed adjacent-but-
      // overlapping bookings (e.g. a 5:00 PM + 2hr booking didn't
      // mark the 5:15 + 15min slot as taken — visitor saw "open",
      // server eventually rejected on submit).
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

      // Convert to ms ranges once — every status check loops over
      // these. For typical hosts (single-digit bookings per slot
      // horizon) the O(slots × bookings) scan is fine; if it grows we
      // can sort + binary-search later.
      const bookingRanges = bookings.map((b) => ({
        start: b.slotStart.getTime(),
        end: b.slotEnd.getTime(),
      }));

      return slots.map((slot) => {
        const slotStartMs = new Date(slot.start).getTime();
        const slotEndMs = new Date(slot.end).getTime();
        // Range-overlap predicate: A overlaps B iff
        //   A.start < B.end AND A.end > B.start
        // Strict inequalities so exact-touch boundaries (10:00 booking
        // ending exactly at 11:00 doesn't block an 11:00 slot) don't
        // count as overlap. Mirrors what bookings.create's collision
        // check below uses — both sides agree on "overlap" semantics.
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
