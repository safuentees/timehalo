import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Officehours <onboarding@resend.dev>"),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    OFFICEHOURS_ADMIN_HANDLES: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
});
