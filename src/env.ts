import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Centralized env validation. Imports of this module fail loudly at
// startup when a required var is missing or malformed — exactly the
// "build-time fail-fast" A2 calls for. Without this, typos in
// CRON_SECRET / RESEND_API_KEY / NEXT_PUBLIC_SENTRY_DSN silently
// no-op, which is much harder to debug than a hard error at boot.
//
// Pattern reference: rallly /apps/web/src/env.ts (server/client split,
// emptyStringAsUndefined). Vercel-injected vars (VERCEL_ENV,
// VERCEL_GIT_COMMIT_REF, NEXT_RUNTIME) and Sentry build-time secrets
// (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT) intentionally live
// outside this schema — they're consumed by next.config.ts /
// instrumentation.ts before the schema is reachable.

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    /**
     * Turso libsql auth token. Required when DATABASE_URL is a remote
     * libsql URL (`libsql://<db>-<org>.turso.io`); ignored when the
     * URL is a local file (`file:...`). The libsql HTTP transport is
     * what serves as the connection pool / edge replica layer for
     * production — there's no separate pgbouncer/Accelerate to
     * configure. Generated via Turso CLI: `turso db tokens create
     * <db-name>`.
     */
    TURSO_AUTH_TOKEN: z.string().optional(),
    AUTH_SECRET: z.string().min(1),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    /**
     * Bearer token the cron processor expects in the Authorization
     * header. Missing → cron unconditionally 401s. Optional in the
     * schema so a fresh clone can boot before the operator generates
     * the secret.
     */
    CRON_SECRET: z.string().optional(),
    /**
     * Resend API key. Missing → email Task rows permanently-skip on
     * the first cron tick (see src/lib/email/index.ts and
     * src/app/api/cron/process-tasks/route.ts). Booking flow is
     * unaffected.
     */
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Officehours <onboarding@resend.dev>"),
    /**
     * Optional dev-only inbox redirect. When set in non-prod environments,
     * `resolveRecipient` (src/lib/email/index.ts) routes ALL outgoing
     * emails to this address instead of Resend's `delivered@resend.dev`
     * dev sink. Lets a developer receive booking reminders / workspace
     * invites / magic links in their own inbox while iterating, without
     * accidentally emailing the visitor address typed into a test
     * booking. Ignored in production (`VERCEL_ENV=production` always
     * sends to the real recipient). Validated as an email address.
     */
    EMAIL_DEV_REDIRECT: z.string().email().optional(),
    /**
     * Optional Upstash Redis for the rate-limit fallback path. When
     * unset, the in-memory limiter (rallly's pattern) is used.
     */
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    /**
     * CSV of host handles permitted to access /admin/*. Empty/unset
     * → no admin access from any account. dub uses workspace-
     * membership for the same gate; we don't have workspaces yet,
     * so a static env list is the smaller equivalent. Validate the
     * handle, not the user id, so rotating the underlying user row
     * doesn't quietly drop admin access.
     */
    OFFICEHOURS_ADMIN_HANDLES: z.string().optional(),
    /**
     * Calendar OAuth (B3). Both providers optional — the adapter
     * factory returns null when client_id/secret are unset, so the
     * busy-time merge gracefully no-ops. Set both to wire up Google
     * Calendar / Microsoft Graph free-busy reads.
     */
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
    MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
    /**
     * 32-byte AES-256-GCM key (hex-encoded, 64 chars) for encrypting
     * `CalendarCredential.accessToken` + `refreshToken` at rest.
     * Optional in dev so a fresh clone boots; the encryption helper
     * throws clearly when calendar OAuth is in use without it.
     * Generate with:
     *   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
     */
    CALENDAR_TOKEN_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (32 bytes)")
      .optional(),
    /**
     * Stripe billing (B3 — checkout + portal). All optional so a
     * fresh clone boots without a Stripe account; the procedures
     * gate on STRIPE_SECRET_KEY and throw PRECONDITION_FAILED when
     * unset. STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM are the price ids
     * created in the Stripe dashboard for each plan; checkout
     * sessions reference them. STRIPE_WEBHOOK_SECRET signs the
     * incoming webhook payloads (already used by the existing
     * verifier in src/lib/billing.ts).
     */
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    STRIPE_PRICE_TEAM: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  },
  client: {
    /**
     * Public app URL for outbound emails (confirmation links). When
     * unset, code falls back to "http://localhost:3001" so dev still
     * works without `.env` plumbing.
     */
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    /**
     * Sentry DSN — gates the observability `withSpan` from the
     * console-log fallback to actual Sentry transport.
     */
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Next 13.4.4+ supports auto-runtimeEnv for client vars. We list
   * client + shared vars explicitly to keep the build safe under
   * static analysis (Next inlines NEXT_PUBLIC_* at build, but only
   * if the literal name appears in source).
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  /**
   * Empty strings ("CRON_SECRET=") count as "unset" rather than
   * triggering schema failure. Critical for the .env.example pattern
   * where empty values mean "fill this in."
   */
  emptyStringAsUndefined: true,
});
