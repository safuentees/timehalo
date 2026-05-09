import { z } from "zod";
import { timezoneSchema } from "@/lib/timezone";
import { durationMinutesSchema } from "@/lib/durations";

/**
 * Shared booking input schema — used by both the tRPC `bookings.create`
 * procedure and the react-hook-form resolver on the client. Single
 * source of truth: if the shape changes, both sides move in lockstep.
 */
export const bookingInputSchema = z.object({
  handle: z.string().min(1),
  slotStart: z.string().datetime(),
  // Client generates one v4 UUID at form mount and reuses it for every
  // retry. Server short-circuits the second submission with the same
  // key and returns the original booking. crypto.randomUUID() is an
  // RFC 4122 v4 UUID — z.string().uuid() validates that format.
  idempotencyKey: z.string().uuid(),
  visitorName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Too long"),
  visitorEmail: z
    .string()
    .trim()
    .email("Not a valid email")
    .max(200, "Too long"),
  question: z
    .string()
    .trim()
    .max(500, "Keep it under 500 characters")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Visitor's IANA timezone, captured client-side at submit time via
  // Intl.DateTimeFormat().resolvedOptions().timeZone. Optional so
  // programmatic creates / older client builds still work — when
  // present we validate + store; when absent the booking row's
  // visitorTimezone stays null.
  visitorTimezone: timezoneSchema.optional(),
  // B.PT275 — visitor's chosen duration, in minutes. Optional: when
  // omitted, the procedure falls back to the host's
  // `EventType.durationMins` default. When present, the procedure
  // validates the value sits in `resolveDurationChoices(eventType)`
  // (i.e. either the configured `durationMinsList` or the singleton
  // default). 5..480 floor/ceiling matches `durationsListSchema` so
  // the chip strip on /h/[handle] can't surface values the back end
  // would refuse.
  durationMinutes: durationMinutesSchema.optional(),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

/**
 * Client-only form schema — same shape without `handle` and `slotStart`,
 * which the host page supplies out-of-band. Keeps the form generic so
 * it can be embedded in other booking contexts later.
 */
export const bookingFormSchema = bookingInputSchema.pick({
  visitorName: true,
  visitorEmail: true,
  question: true,
});

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
