import "server-only";
import { prisma } from "@/lib/prisma";

// Feature flag helpers. Pattern lifted from cal.com's Feature model
// (packages/prisma/schema.prisma:1370-1426) shrunk to single-user
// scope. The DB stores explicit overrides; defaults live in code so
// adding a new flag doesn't require a migration + seed step.
//
// Decision matrix:
//   no DB row              → use FEATURE_DEFAULTS[slug] ?? false
//   row, enabled=false     → off (kill switch)
//   row, enabled=true,
//     no UserFeatures rows → globally on
//   row, enabled=true,
//     UserFeatures rows    → on only for assigned users
//
// Adding a flag: append to FEATURE_DEFAULTS below + reference by slug
// in code. The TS type derived from FEATURE_DEFAULTS is the single
// source of truth for known flags — typos at the call site fail at
// compile time.

export const FEATURE_DEFAULTS = {
  // Live host queue (item 8). Defaults ON; killing the SSE bus
  // is one DB row away if it ever misbehaves.
  "live-queue": true,
} as const;

export type FeatureSlug = keyof typeof FEATURE_DEFAULTS;

const KNOWN_SLUGS = Object.keys(FEATURE_DEFAULTS) as FeatureSlug[];

/**
 * Resolves whether `slug` is currently enabled for `userId` (or
 * globally if userId is undefined). Single round-trip when no
 * UserFeatures rows exist; two when they do.
 */
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

  // No DB row → fall back to the in-code default. Adding a flag is
  // just a TS change; no migration required to ship enabled-by-
  // default features.
  if (!feature) return FEATURE_DEFAULTS[slug];

  // Kill switch — explicit off.
  if (!feature.enabled) return false;

  // Globally on (no scoping rows).
  if (feature._count.assignments === 0) return true;

  // Scoped feature, no user → off. (Anonymous traffic doesn't qualify
  // for an experiment that's only assigned to specific users.)
  if (!userId) return false;

  const assignment = await prisma.userFeatures.findUnique({
    where: {
      userId_featureSlug: { userId, featureSlug: slug },
    },
    select: { userId: true },
  });
  return !!assignment;
}

/**
 * Returns the full enabled-flag map for a user. Used by the client
 * to know which features to render. One round-trip — fetches all
 * known features + the user's UserFeatures rows in parallel, then
 * resolves each flag in memory.
 */
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
