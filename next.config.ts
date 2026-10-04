import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const baseCspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.upstash.io",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
];
const cspDefault = [...baseCspParts, "frame-ancestors 'none'"].join("; ");
const cspEmbed = [...baseCspParts, "frame-ancestors *"].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    const sharedHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: [
          "camera=()",
          "microphone=()",
          "geolocation=()",
          "payment=()",
          "accelerometer=()",
          "gyroscope=()",
          "magnetometer=()",
          "usb=()",
          "interest-cohort=()",
        ].join(", "),
      },
    ];
    return [
      {
        source: "/(embed.js|embed/.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspEmbed },
          ...sharedHeaders,
        ],
      },
      {
        // The default policy must not override the deliberate embed exception.
        source: "/((?!embed/|embed\\.js$).*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDefault },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          ...sharedHeaders,
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
