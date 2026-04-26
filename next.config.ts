import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly so Next 16's Turbopack stops
  // finding the stray ~/pnpm-lock.yaml in the user's home directory
  // and assuming the workspace lives there. Without this, multi-
  // lockfile warning fires on every `pnpm dev`.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// withSentryConfig wires the Sentry plugin into the build. Source-map
// upload + tunneling for ad-blocker-evasion happen here. Reads
// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN from env at build
// time. When those aren't set (local dev, CI without secrets), the
// plugin no-ops on the source-map step but still injects runtime
// instrumentation. `silent: !CI` keeps build logs clean locally.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
