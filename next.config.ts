import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

// D1 — Content-Security-Policy. Static CSP (no per-request nonce) is
// the simpler shipping path for Next 16 App Router; the nonce-based
// approach requires plumbing `x-nonce` through every server component
// + every <Script> tag, which is a substantial refactor. The trade-off
// is `'unsafe-inline'` on script-src + style-src — React 19's
// hydration injects inline <script> data, and Tailwind + shadcn ship
// inline style attributes. Promote to the nonce-based variant via a
// future B.PT row when the launch surface stabilizes.
//
// Allowlists scoped to actually-used third parties:
// - Stripe Checkout (script + frame + xhr)
// - Sentry (xhr only — SDK is bundled via @sentry/nextjs, not CDN)
// - Upstash Redis REST (xhr only)
// - GitHub avatars (img)
// - Google avatars (img — calendar OAuth + GitHub-via-Google chain)
// - Vercel preview URLs (frame-ancestors stays 'none' to block
//   clickjacking; vercel.live previews don't need to be embeddable)
//
// upgrade-insecure-requests forces any http:// reference to https://
// frame-ancestors 'none' = X-Frame-Options DENY equivalent (D3).
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.upstash.io",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly so Next 16's Turbopack stops
  // finding the stray ~/pnpm-lock.yaml in the user's home directory
  // and assuming the workspace lives there. Without this, multi-
  // lockfile warning fires on every `pnpm dev`.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        // Apply to every route. Next.js auto-excludes _next static
        // assets from header-rewrite where appropriate.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspDirectives,
          },
        ],
      },
    ];
  },
};

// next-intl plugin — points at the request-scoped config that resolves
// the active locale + messages. Plugin order: next-intl first, then
// Sentry wraps the result, so the runtime sees the i18n-augmented
// config and the Sentry build-time wrappers see the same.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// withSentryConfig wires the Sentry plugin into the build. Source-map
// upload + tunneling for ad-blocker-evasion happen here. Reads
// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN from env at build
// time. When those aren't set (local dev, CI without secrets), the
// plugin no-ops on the source-map step but still injects runtime
// instrumentation. `silent: !CI` keeps build logs clean locally.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
