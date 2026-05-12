import { z } from "zod";
import { timezoneSchema } from "@/lib/timezone";

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
  // Browser-detected IANA timezone. Client-only — server never has
  // access to the visitor's TZ, so it travels as part of the signup
  // payload. Optional so a tampered or `Intl`-less client can still
  // register; the server defaults to UTC in that case + the OAuth
  // auto-set fallback (dashboard layout) writes the real value on
  // first /bookings load. Validated against `timezoneSchema` so a
  // bad value can't poison the User row.
  timezone: timezoneSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export function deriveHandleFromEmail(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length >= 3 ? slug.slice(0, 30) : null;
}

export function derivePlaceholderHandle(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `u-${suffix}`;
}
