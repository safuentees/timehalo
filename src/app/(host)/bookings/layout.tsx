import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

// Bookings route layout. Prefetches data that DOES NOT change with
// search params (`?view`, `?date`, `?tab`) so server-side prefetch
// runs ONCE on initial route entry and persists across view/date/
// tab toggles. Next.js layouts don't receive `searchParams` and
// don't re-execute on searchParam-only navigation — moving these
// prefetches here means clicking Day/Week/Month/List doesn't
// re-fetch bookings/features/me/schedule from the DB.
//
// page.tsx only handles searchParam parsing now — no DB I/O on
// view changes. Refetch on the client is gated entirely by:
//   1. The 60s default staleTime (or `Infinity` per-query if set)
//   2. SSE-driven `bookings.listForHost.invalidate()` from
//      `<LiveQueue />` when a new booking arrives.
//
// The HydrationBoundary here populates the client queryClient with
// the prefetched data; page.tsx's BookingsList reads via plain
// `useQuery` without re-fetching since the cache is already warm.

export default async function BookingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const trpc = await createPrivateSSRHelper();
  // Parallel prefetch. featureFlags drives whether <LiveQueue /> mounts;
  // users.me feeds the empty-state CTA's `/h/<handle>` link without
  // a second roundtrip when the empty path renders.
  //
  // schedule.get (B.PT42) — the inline `<OnboardingChecklist>` reads
  // the host's AvailabilityRange rows to auto-check the "Draw your
  // weekly hours" step. Without this prefetch, the checklist
  // server-renders with `availabilityCount: 0` (the query is
  // unhydrated), the availability step shows unchecked, the card
  // appears completed-but-pending, then client-side fetch resolves
  // and the card disappears or the row updates — visible "card
  // flashes back" + "checkbox briefly unmarked" on hard refresh.
  // Adding it here closes the hydration gap for the checklist.
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.featureFlags.prefetch(),
    trpc.users.me.prefetch(),
    trpc.schedule.get.prefetch(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
