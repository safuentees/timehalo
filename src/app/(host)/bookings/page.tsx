import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList, type Tab } from "./components/bookings-list";

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
