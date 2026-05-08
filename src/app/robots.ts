import type { MetadataRoute } from "next";
import { env } from "@/env";

// G3 — robots.txt at /robots.txt. Per Next.js metadata file
// conventions (docs/01-app/03-api-reference/03-file-conventions/
// 01-metadata/robots.mdx) — exporting `default` from src/app/robots.ts
// causes Next to serve the resolved rules at /robots.txt at runtime.
//
// Disallow rules cover the authed surface (host group + admin) and
// API routes that have no public value when crawled. The visitor
// surface (/h/<handle>) is explicitly allowed so host profiles can
// be indexed. Sitemap URL points to G4's dynamic sitemap.

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://officehours.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/h/"],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/bookings",
          "/availability",
          "/profile",
          "/settings",
          "/workspaces",
          "/preview/",
          "/login",
          "/register",
          "/invitations/",
          "/embed/",
          "/embed.js",
          "/booked/",
          "/h/*/booked/",
          "/w/*/booked/",
          "/playground/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
