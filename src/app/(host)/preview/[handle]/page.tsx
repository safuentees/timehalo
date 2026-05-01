import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import PreviewShell from "./preview-shell";

// `/(host)/preview/<handle>` — host's view of their own public booking
// page, rendered INSIDE the dashboard chrome. Two reasons this lives in
// `(host)/` and not `/h/`:
//   1. The dashboard `(host)/layout.tsx` provides the chrome (topbar +
//      sidebar + panel) that this route's chrome-morph CSS needs to
//      animate against. Putting it under `/h/` would render with the
//      bare `oh-root` shell and skip the morph entirely.
//   2. The visitor surface itself stays at `/h/<handle>` (anonymous,
//      shareable, indexable). This is the host-only mirror.
//
// Same data shape as `/h/[handle]/page.tsx` — public queries (no auth
// scope on the slot list, the visitor surface gates that itself via
// `users.getByHandle`'s public-safe column projection). We hydrate them
// here so the chrome-morph entrance has its data ready and there's no
// flash of empty profile while the panel slides into full-bleed mode.
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();
  const renderedAt = new Date().toISOString();
  let user;
  let slots;

  try {
    [user, slots] = await Promise.all([
      trpc.users.getByHandle.fetch({ handle }),
      trpc.schedule.getUpcomingSlots.fetch({ handle }),
    ]);
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <PreviewShell
        handle={handle}
        initialUser={user}
        initialSlots={slots}
        renderedAt={renderedAt}
      />
    </HydrationBoundary>
  );
}
