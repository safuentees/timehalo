import { z } from "zod";

export const handleSchema = z
  .string()
  .trim()
  .min(3, "3+ characters")
  .max(30, "30 characters max")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

export const registerInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254, "Email is too long")
    .transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .max(128, "Password is too long"),
  handle: handleSchema,
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
