import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

// G4 — dynamic sitemap.xml at /sitemap.xml. Per Next.js metadata
// file conventions — exporting `default` from src/app/sitemap.ts
// generates the XML response. Lists the home page + every host
// with a non-null handle. Confirmation pages are private (G3 robots
// disallow + G1 robots noindex) so they don't appear here.

export const revalidate = 3600; // 1h ISR — handle additions/changes
                               // surface within the next hour
                               // without forcing a per-request DB
                               // hit on each crawler GET.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://officehours.app";
  const hosts = await prisma.user.findMany({
    where: { handle: { not: null } },
    select: { handle: true, updatedAt: true },
  });

  const now = new Date();
  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 1.0,
    },
    ...hosts
      .filter((h): h is { handle: string; updatedAt: Date } =>
        h.handle !== null,
      )
      .map((host) => ({
        url: `${baseUrl}/h/${host.handle}`,
        lastModified: host.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
  ];
}
