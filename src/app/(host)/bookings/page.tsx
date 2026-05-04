import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList, type Tab } from "./components/bookings-list";
import type { ViewMode } from "./components/bookings-view-switcher";

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
  const activeView: ViewMode = isView(params.view) ? params.view : "list";
  const cursorDate = parseCursorDate(params.date);

  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.featureFlags.prefetch(),
    trpc.users.me.prefetch(),
    trpc.schedule.get.prefetch(),
  ]);

  return (
    <main className="oh-main">
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <BookingsList
          activeTab={activeTab}
          activeView={activeView}
          cursorDate={cursorDate}
        />
      </HydrationBoundary>
    </main>
  );
}
