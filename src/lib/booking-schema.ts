import { z } from "zod";

/**
 * Shared booking input schema — used by both the tRPC `bookings.create`
 * procedure and the react-hook-form resolver on the client. Single
 * source of truth: if the shape changes, both sides move in lockstep.
 */
export const bookingInputSchema = z.object({
  handle: z.string().min(1),
  slotStart: z.string().datetime(),
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
