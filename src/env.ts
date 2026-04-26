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
  },
  client: {
    /**
     * Public app URL for outbound emails (confirmation links). When
     * unset, code falls back to "http://localhost:3000" so dev still
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
