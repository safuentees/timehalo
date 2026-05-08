import type { MetadataRoute } from "next";
import { env } from "@/env";

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
