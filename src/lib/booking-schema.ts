import { z } from "zod";
import { timezoneSchema } from "@/lib/timezone";
import { durationMinutesSchema } from "@/lib/durations";

export const bookingInputSchema = z.object({
  handle: z.string().min(1),
  slotStart: z.string().datetime(),
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
  visitorTimezone: timezoneSchema.optional(),
  durationMinutes: durationMinutesSchema.optional(),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

export const bookingFormSchema = bookingInputSchema.pick({
  visitorName: true,
  visitorEmail: true,
  question: true,
});

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
