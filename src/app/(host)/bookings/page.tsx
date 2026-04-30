import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList, type Tab } from "./components/bookings-list";

// Bookings — primary host surface. Apple HIG: the screen the user
// "came for" is one tap from launch (here: zero, since `/` redirects).
//
// SHAPE (B.PT40):
// page.tsx is async at the top and awaits all prefetches before
// returning JSX. No `loading.tsx`, no inner `<Suspense>`. The full
// page renders server-side with hydrated data; client hydration is
// instantaneous (HydrationBoundary populates the singleton browser
// queryClient + useQuery reads it on first render). Matches the
// `fix/next-pin-16.1.7` upstream behavior verbatim — page takes
// slightly longer TTFB but no skeleton, no flash, no layout shift.
//
// B.PT39 attempted a granular Suspense pattern (chrome sync, rows
// in a Suspense calling `useSuspenseQuery`). It broke SSR: the
// queryClient inside the page-level `<HydrationBoundary>` is a
// SEPARATE instance from the one `createServerSideHelpers`
// populates, and on server-render of the rows client component the
// cache was empty → useSuspenseQuery tried to invoke the queryFn →
// tRPC's `httpBatchLink` with relative URL `/api/trpc/...` failed
// to parse on Node fetch ("Failed to parse URL"). Tanstack's modern
// fix is `@tanstack/react-query-next-experimental`'s
// `ReactQueryStreamedHydration` provider; we don't ship that yet.
// useQuery + the legacy hydration boundary works without it.

const VALID_TABS = ["upcoming", "past"] as const satisfies readonly Tab[];

function isTab(value: string | undefined): value is Tab {
  return VALID_TABS.includes(value as Tab);
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab: Tab = isTab(params.tab) ? params.tab : "upcoming";

  const trpc = await createPrivateSSRHelper();
  // Parallel prefetch. featureFlags drives whether <LiveQueue /> mounts;
  // users.me feeds the empty-state CTA's `/h/<handle>` link without
  // a second roundtrip when the empty path renders.
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.featureFlags.prefetch(),
    trpc.users.me.prefetch(),
  ]);

  return (
    <main className="oh-main">
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <BookingsList activeTab={activeTab} />
      </HydrationBoundary>
    </main>
  );
}
