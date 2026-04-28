import "server-only";

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
