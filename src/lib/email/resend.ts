import "server-only";
import { Resend } from "resend";
import { env } from "@/env";

// Single Resend client. Returns null when RESEND_API_KEY is unset so
// dev / test / no-mail-prod paths degrade silently instead of
// throwing at module load. Call sites guard on this.
//
// Pattern source: dub /packages/email/src/send-via-resend.ts:64-69 —
// "if (!resend) return; console.info('skipping')". Same shape.
export const resend = env.RESEND_API_KEY
  ? new Resend(env.RESEND_API_KEY)
  : null;

// Default sender. Resend's `onboarding@resend.dev` works without a
// verified domain — useful for first-run dev. Production deployments
// should set EMAIL_FROM to a verified address.
export const EMAIL_FROM = env.EMAIL_FROM;
