import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Server-only siblings of the pure helpers in `./workspaces.ts`. The
// only inhabitant today is `generateInvitationToken`, which dynamically
// imports `node:crypto`. Splitting it out lets the pure module
// (slug regex, role matrix, helpers) be safely imported from client
// components.
//
// Per Next.js docs (Context7 /vercel/next.js): `import "server-only"`
// belongs on modules that contain actual server APIs, not on every
// module in the same domain. This file is the canonical home for the
// crypto bit; `./workspaces.ts` is the pure share-safe module.

// Generate a hex-encoded 32-byte token for invitation links. 64
// chars; cryptographically suitable for a public-but-unguessable
// accept URL. Same shape as WebhookSubscription.secret (and same
// reasoning — opaque single-use capabilities should be wide).
export async function generateInvitationToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

// B.PT82 — slug-history alias resolver. Workspace pages that take a
// `[slug]` route param call this before fetching workspace data; if
// the slug is a known former slug (the workspace was renamed), the
// helper redirects the request to the workspace's CURRENT slug
// preserving the rest of the path. Used in:
//   - /workspaces/[slug]/members/page.tsx
//   - /workspaces/[slug]/settings/page.tsx
//   - /workspaces/[slug]/event-types/page.tsx
//
// Cost: one DB query per page load on workspace-scoped routes.
// Acceptable for a low-traffic dashboard surface; the alternative
// (middleware-level resolution) adds a network hop on every dashboard
// route regardless of whether it's workspace-scoped.
//
// Throws via `redirect()` (which uses NEXT_REDIRECT internally) when
// it finds an alias — execution doesn't return to the caller. The
// signature is `Promise<void>` so callers don't try to use a return
// value; `await redirectIfAliasedSlug(...)` then continue with normal
// page logic if no redirect happened.
export async function redirectIfAliasedSlug(
  slug: string,
  subPath: "members" | "settings" | "event-types",
): Promise<void> {
  // First check if the slug currently belongs to a workspace. If so,
  // it's not aliased — early return saves the second query.
  const current = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (current) return;

  // Slug doesn't resolve to any current workspace. Look in history.
  const alias = await prisma.workspaceSlugHistory.findUnique({
    where: { oldSlug: slug },
    select: {
      workspace: { select: { slug: true } },
    },
  });
  if (!alias) return;

  // Found a stale slug — redirect to the current one. Per Next.js
  // App Router docs (Context7 /vercel/next.js): `redirect()` from
  // `next/navigation` throws `NEXT_REDIRECT`; the framework catches
  // it and emits an HTTP redirect response. Don't try/catch around
  // it — the throw IS the contract.
  redirect(`/workspaces/${alias.workspace.slug}/${subPath}`);
}
