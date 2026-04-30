import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import { LiveQueue, type Tab } from "./components/bookings-list";
import { BookingsTabs } from "./components/bookings-tabs";
import { BookingsRowsBoundary } from "./components/bookings-rows-boundary";
import { BookingsRowsSkeleton } from "./components/bookings-rows-skeleton";

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

        <div className="mt-6">
          <Suspense fallback={<BookingsRowsSkeleton />}>
            <BookingsRowsBoundary />
          </Suspense>
        </div>
      </OhPageShell>
    </main>
  );
}
