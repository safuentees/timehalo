import { BookingsList, type Tab } from "./components/bookings-list";
import type { ViewMode } from "./components/bookings-view-switcher";

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
const VALID_VIEWS = [
  "day",
  "week",
  "month",
  "list",
] as const satisfies readonly ViewMode[];

function isTab(value: string | undefined): value is Tab {
  return VALID_TABS.includes(value as Tab);
}

function isView(value: string | undefined): value is ViewMode {
  return VALID_VIEWS.includes(value as ViewMode);
}

// Parse `?date=YYYY-MM-DD` to a local-midnight Date, or fall back to
// today. Local-component construction (not Date.parse on ISO with Z)
// avoids the UTC-offset drift that would otherwise shift the cursor
// to the previous day in negative-offset zones — same lesson from
// B.PT136's playground gallery TZ fix.
function parseCursorDate(raw: string | undefined): Date {
  if (raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const candidate = new Date(y, m - 1, d);
      if (!isNaN(candidate.getTime())) return candidate;
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const activeTab: Tab = isTab(params.tab) ? params.tab : "upcoming";
  // Default view = "list" — preserves the legacy /bookings UX for
  // anyone hitting the route without a ?view= param. The view-mode
  // switcher in `BookingsList` is the discoverability surface for
  // the new calendar modes (Day/Week/Month). Mobile-default
  // override (§11 q1 — DAY vs LIST below 700px) is open and not
  // resolved yet; this server component renders the same default
  // for all viewports until that lands.
  const activeView: ViewMode = isView(params.view) ? params.view : "list";
  const cursorDate = parseCursorDate(params.date);

  // No prefetch here — moved to bookings/layout.tsx so it runs
  // once per route entry, not on every searchParam change. The
  // layout's HydrationBoundary populates the client queryClient;
  // BookingsList below reads via useQuery without re-fetching.
  return (
    <main className="oh-main">
      <BookingsList
        activeTab={activeTab}
        activeView={activeView}
        cursorDate={cursorDate}
      />
    </main>
  );
}
