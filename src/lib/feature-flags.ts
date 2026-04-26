import "server-only";
import { prisma } from "@/lib/prisma";

export const FEATURE_DEFAULTS = {
  "live-queue": true,
} as const;

export type FeatureSlug = keyof typeof FEATURE_DEFAULTS;

const KNOWN_SLUGS = Object.keys(FEATURE_DEFAULTS) as FeatureSlug[];

export async function isFeatureEnabled(
  slug: FeatureSlug,
  userId?: string,
): Promise<boolean> {
  const feature = await prisma.feature.findUnique({
    where: { slug },
    select: {
      enabled: true,
      _count: { select: { assignments: true } },
    },
  });

  if (!feature) return FEATURE_DEFAULTS[slug];

  if (!feature.enabled) return false;

  if (feature._count.assignments === 0) return true;

  if (!userId) return false;

  const assignment = await prisma.userFeatures.findUnique({
    where: {
      userId_featureSlug: { userId, featureSlug: slug },
    },
    select: { userId: true },
  });
  return !!assignment;
}

export async function getEnabledFeatures(
  userId?: string,
): Promise<Record<FeatureSlug, boolean>> {
  const [features, assignments] = await Promise.all([
    prisma.feature.findMany({
      where: { slug: { in: KNOWN_SLUGS } },
      select: {
        slug: true,
        enabled: true,
        _count: { select: { assignments: true } },
      },
    }),
    userId
      ? prisma.userFeatures.findMany({
          where: { userId, featureSlug: { in: KNOWN_SLUGS } },
          select: { featureSlug: true },
        })
      : Promise.resolve([]),
  ]);

  const featuresBySlug = new Map(features.map((f) => [f.slug, f]));
  const userAssigned = new Set(assignments.map((a) => a.featureSlug));

  const out = {} as Record<FeatureSlug, boolean>;
  for (const slug of KNOWN_SLUGS) {
    const feature = featuresBySlug.get(slug);
    if (!feature) {
      out[slug] = FEATURE_DEFAULTS[slug];
      continue;
    }
    if (!feature.enabled) {
      out[slug] = false;
      continue;
    }
    if (feature._count.assignments === 0) {
      out[slug] = true;
      continue;
    }
    out[slug] = userId ? userAssigned.has(slug) : false;
  }
  return out;
}
