import { z } from "zod";

export const handleSchema = z
  .string()
  .trim()
  .min(3, "3+ characters")
  .max(30, "30 characters max")
  .regex(/^[a-z0-9-]+$/, "Lowercase, numbers, hyphens");

// B.PT285 — handle removed from the register form (dub.co pattern).
// Signup collects email + password only; the handle is auto-generated
// as a placeholder (`u-<5char>`) at User.create time so downstream
// workspace + event-type seeding succeed atomically. Users claim a
// real handle at /onboarding/handle (cal.com-style live availability
// check + email-derived suggestion). See `claimHandle` mutation +
// `derivePlaceholderHandle` util.
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
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

// Email-derived suggestion for the onboarding handle picker.
// Mirrors cal.com `guessUsernameFromEmail` (lib/signup/getServerSide
// Props.tsx:163-166) — strip the local-part, slugify (lowercase, drop
// non-alphanumerics, collapse hyphens). Returns null when the result
// is too short or empty so callers know to skip the prefill.
export function deriveHandleFromEmail(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length >= 3 ? slug.slice(0, 30) : null;
}

// Placeholder handle minted at signup so the User.handle column stays
// non-null and downstream workspace/eventType slug seeding succeeds.
// `u-` prefix + 5 random alphanumeric chars = 7 char total, well
// inside the 3..30 schema range. Collision rate is ~1 in 60M per
// attempt; the unique-constraint retry in the register transaction
// handles the rare clash.
export function derivePlaceholderHandle(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `u-${suffix}`;
}
