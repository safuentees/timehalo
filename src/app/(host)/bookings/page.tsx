import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import { LiveQueue, type Tab } from "./components/bookings-list";
import { BookingsTabs } from "./components/bookings-tabs";
import { BookingsRowsBoundary } from "./components/bookings-rows-boundary";
import { BookingsRowsSkeleton } from "./components/bookings-rows-skeleton";

// Bookings — primary host surface. Apple HIG: the screen the user
// "came for" is one tap from launch (here: zero, since `/` redirects).
//
// B.PT39 — granular Suspense pattern. The page is async only for
// fast, sync-ish things (searchParams, locale). The slow data
// fetching lives in `<BookingsRowsBoundary>`, wrapped in a
// `<Suspense>` whose fallback covers ONLY the rows area. Chrome
// (page header + tab strip + onboarding checklist) renders
// synchronously above the boundary, so on hard refresh the user sees
// the chrome instantly + a row-shaped skeleton briefly + then rows
// — instead of the whole page flashing the route-level loading.tsx
// fallback (which we removed alongside this commit).
//
// Pattern reference: Tanstack Query *Advanced SSR* docs (verified
// via Context7 against `/tanstack/query` + `/websites/trpc_io` —
// the docs explicitly recommend `useSuspenseQuery` paired with a
// `<Suspense>` boundary inside the page). cal.com routes status via
// `/bookings/[status]` (heavier reshape we don't need yet); our
// search-param tab encoding gives the same "URL is the source of
// truth" without a route reshape.

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
  const tab: Tab = isTab(params.tab) ? params.tab : "upcoming";
  const t = await getTranslations("Bookings");

  return (
    <main className="oh-main">
      <OhPageShell>
        <OhPageHeader title={t("title")} aside={<LiveQueue />} />

        <OnboardingChecklist />

        <BookingsTabs activeTab={tab} />

        {/* Only the rows area suspends. Chrome above renders
            synchronously in the first stream chunk — no skeleton
            flash on the chrome. The Suspense fallback covers the
            rows shape only. No `key={tab}` here because the
            client `useSuspenseQuery` reads the same dehydrated
            payload (server returns BOTH upcoming + past in one
            query); flipping the tab is a pure URL update + client
            re-filter, no re-suspend. */}
        <div className="mt-6">
          <Suspense fallback={<BookingsRowsSkeleton />}>
            <BookingsRowsBoundary />
          </Suspense>
        </div>
      </OhPageShell>
    </main>
  );
}
