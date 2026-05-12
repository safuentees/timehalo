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

// Pass the cursor as `YYYY-MM-DD` STRING, not a `Date`. Reason: server
// runs in UTC, client in the visitor's local TZ. A `Date` built from
// `new Date(y, m-1, d)` on the server is UTC midnight; crossed to the
// client and read via local-TZ `getDate()`, it can land on the
// previous calendar day (TZs west of UTC) — which produced the
// "view-switch decrements day by 1" regression. Strings are TZ-free
// calendar keys; the client builds its own local-anchored Date once.
function normalizeCursorParam(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const activeTab: Tab = isTab(params.tab) ? params.tab : "upcoming";
  const activeView: ViewMode = isView(params.view) ? params.view : "list";
  const cursorDate = normalizeCursorParam(params.date);

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
