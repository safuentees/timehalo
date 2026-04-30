import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsRows } from "./bookings-rows";

// Async server component — the only suspending child of `page.tsx`'s
// `<Suspense>`. While this awaits the prefetch, the parent Suspense
// emits its skeleton fallback as the first stream chunk; chrome
// (page header + tab strip + onboarding checklist) is visible
// immediately because it's rendered SYNCHRONOUSLY outside this
// boundary.
//
// Pattern: Tanstack Query *Advanced SSR* docs +
// `trpc.io/docs/client/nextjs/app-router-setup`. Each suspending
// island gets its own `createServerSideHelpers` call (cached per
// request via `cache()`); after the awaits resolve, `dehydrate`
// captures the queries' state and `HydrationBoundary` ships them to
// the client component below. The client's `useSuspenseQuery` reads
// the hydrated cache on first render — no extra fetch, no client-
// side skeleton.
//
// users.me is prefetched alongside listForHost so the empty-state
// CTA (`/h/<handle>`) hydrates without a second roundtrip when the
// empty path renders. featureFlags is NOT prefetched here — it lives
// in the chrome's <LiveQueue/>, which is fine fetching client-side
// after the chrome appears (the LiveDot has its own 500ms hidden
// grace so a brief client-side-fetch delay stays invisible).

export async function BookingsRowsBoundary() {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.me.prefetch(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <BookingsRows />
    </HydrationBoundary>
  );
}
