"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, MailIcon } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { trpc } from "@/trpc/hooks";
import {
  OhEmpty,
  OhEmptyContent,
  OhEmptyDescription,
  OhEmptyHeader,
  OhEmptyMedia,
  OhEmptyTitle,
} from "@/components/oh/oh-empty";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { CalendarEvent } from "@/lib/calendar-grid/types";
import { BookingDetailModal } from "./booking-detail-modal";
import {
  BookingsViewSwitcher,
  type ViewMode,
} from "./bookings-view-switcher";
import { DayView } from "./calendar/day-view";
import { WeekView } from "./calendar/week-view";
import { MonthView } from "./calendar/month-view";
import { BookingsCursorControls } from "./calendar/cursor-controls";

export type Tab = "upcoming" | "past";

const VALID_TABS = ["upcoming", "past"] as const satisfies readonly Tab[];

// Page-level client component for /bookings. Reads bookings from the
// hydrated React Query cache (set up by `page.tsx`'s
// `<HydrationBoundary>`) via `useQuery` — NOT `useSuspenseQuery`.
//
// HISTORICAL NOTE (B.PT39 → B.PT40):
// B.PT39 split this into a granular-Suspense pattern (chrome sync,
// rows in a `<Suspense>` calling `useSuspenseQuery`). That broke
// SSR: with our legacy `@trpc/react-query` proxy, the queryClient
// inside the `<HydrationBoundary>` is a separate instance from the
// one `createServerSideHelpers` populates. When the server-rendered
// `BookingsRows` (client component) called `useSuspenseQuery`, the
// cache it saw was empty (different queryClient than the prefetched
// one), and `useSuspenseQuery` tried to call the queryFn — which
// for tRPC is the `httpBatchLink` with a relative `/api/trpc/...`
// URL. Node's `fetch` can't parse relative URLs, so SSR threw and
// Next fell back to client rendering. Tanstack's modern fix
// (`@tanstack/react-query-next-experimental` + the streaming
// hydration provider) is a new dep + rewrite of `provider.tsx`;
// the pragmatic fix is to use `useQuery` (no suspend, no SSR
// fetch attempt) and rely on `HydrationBoundary`'s synchronous
// hydration during client mount. Matches the upstream
// `fix/next-pin-16.1.7` shape verbatim.
//
// Tab state lives in the URL (`?tab=upcoming|past`, only used when
// view=list). View-mode state ALSO lives in the URL
// (`?view=day|week|month|list`, default list — preserves legacy
// behavior). `activeTab` and `activeView` are passed in via props
// from `page.tsx`'s `searchParams` read; changes push to the URL
// via `router.push`, which re-runs the page's server tree without a
// full reload. `cursorDate` is the calendar's reference date — also
// URL-driven (`?date=YYYY-MM-DD`); B.PT140 wires the prev/today/
// next controls. For now the cursor is read-only from the URL.
export function BookingsList({
  activeTab,
  activeView,
  cursorDate,
}: {
  activeTab: Tab;
  activeView: ViewMode;
  cursorDate: Date;
}) {
  const t = useTranslations("Bookings");
  const router = useRouter();
  const { data, isError, error } = trpc.bookings.listForHost.useQuery();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  // Selected booking for the detail modal. State-driven instead of
  // intercepted-route navigation — the modal opens synchronously, no
  // server roundtrip, and prev/next chevrons swap content in place.
  // Hard refresh / cmd-click on a row still hits the standalone page
  // route at /bookings/[publicUid].
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Combined booking → CalendarEvent adapter for the calendar views.
  // listForHost only returns deleted=false rows, so all events are
  // status: "confirmed" — cancellations don't surface here today.
  // Adjacent prev/past split (`data.upcoming` / `data.past`) is
  // irrelevant for the calendar; the views filter to their visible
  // date range internally.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    if (!data) return [];
    const all = [...data.upcoming, ...data.past];
    return all.map((b) => ({
      id: b.publicUid,
      title: b.visitorName,
      start: new Date(b.slotStart as unknown as string),
      end: new Date(b.slotEnd as unknown as string),
      status: "confirmed" as const,
      refId: b.publicUid,
    }));
  }, [data]);

  // View switcher: push `?view=...` (preserve `?tab=...` so the user
  // who switches list → week → list lands back on their original tab,
  // and `?date=...` so the cursor doesn't reset when the user flips
  // between calendar modes).
  const onViewChange = (next: ViewMode) => {
    if (next === activeView) return;
    const params = new URLSearchParams();
    params.set("view", next);
    if (next === "list") {
      params.set("tab", activeTab);
    } else {
      params.set("date", formatDateParam(cursorDate));
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Cursor date controls (B.PT140) — push `?date=YYYY-MM-DD`
  // alongside `?view=`. URL state stays the source of truth so back/
  // forward + bookmark + cmd-click all work consistently.
  const onDateChange = (next: Date) => {
    const params = new URLSearchParams();
    params.set("view", activeView);
    params.set("date", formatDateParam(next));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const onEventClick = (event: CalendarEvent) => {
    if (event.refId) setSelectedUid(event.refId);
  };

  // Cmd+click parity (B.PT142). Calendar chips become `<a>` with
  // this href so power users open the standalone deep link in a new
  // tab. Same pattern as the list rows. The `<BookingDetailModal>`
  // is the canonical surface; the standalone page survives as the
  // hard-refresh / new-tab fallback (per B.PT138).
  const getEventHref = (event: CalendarEvent) =>
    event.refId ? `/bookings/${event.refId}` : "#";

  return (
    <OhPageShell>
      <OhPageHeader
        title={t("title")}
        aside={liveQueueEnabled ? <LiveQueue /> : null}
      />

      <OnboardingChecklist />

      {/* View-mode segmented control. Sits above the per-view chrome
          (tabs in list mode; date controls in calendar modes — date
          controls are wired in B.PT140). */}
      <div className="mt-8">
        <BookingsViewSwitcher value={activeView} onValueChange={onViewChange} />
      </div>

      {activeView === "list" ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === activeTab) return;
            if (!VALID_TABS.includes(value as Tab)) return;
            router.push(`?view=list&tab=${value}`, { scroll: false });
          }}
          className="mt-6"
        >
          <BookingsTabBar
            activeTab={activeTab}
            upcomingCount={data?.upcoming.length ?? 0}
            pastCount={data?.past.length ?? 0}
            tablistLabel={t("tablistLabel")}
            upcomingLabel={t("tabUpcoming")}
            pastLabel={t("tabPast")}
          />

          <TabsContent value="upcoming" className="mt-6">
            <BookingsListPanel
              tab="upcoming"
              bookings={data?.upcoming ?? []}
              onSelect={setSelectedUid}
            />
          </TabsContent>
          <TabsContent value="past" className="mt-6">
            <BookingsListPanel
              tab="past"
              bookings={data?.past ?? []}
              onSelect={setSelectedUid}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <BookingsCursorControls
            view={activeView}
            cursorDate={cursorDate}
            onDateChange={onDateChange}
          />

          {/* Error banner — shows if the bookings query failed. The
              calendar still renders below so the host sees the
              empty grid structure; the banner makes the failure
              visible + actionable. Page-level prefetch + Hydration-
              Boundary means this is rare in practice (initial paint
              has data) — covers the "user changed view, query
              refetched, network blip" case. */}
          {isError ? (
            <OhInlineEmpty>
              {t("errorLoading")}
              {error?.message ? ` — ${error.message}` : null}
            </OhInlineEmpty>
          ) : null}

          {/* No-bookings-yet hint — only when settled (not error, not
              empty cache) and the host has zero bookings total. The
              calendar still renders below so the host sees the empty
              hour grid (which is informative — "your week is open"). */}
          {!isError && data && calendarEvents.length === 0 ? (
            <OhInlineEmpty>{t("emptyCalendarHint")}</OhInlineEmpty>
          ) : null}

          {activeView === "day" ? (
            <DayView
              date={cursorDate}
              events={calendarEvents}
              selectedRefId={selectedUid}
              onEventClick={onEventClick}
              getHref={getEventHref}
            />
          ) : null}
          {activeView === "week" ? (
            <WeekView
              date={cursorDate}
              events={calendarEvents}
              selectedRefId={selectedUid}
              onEventClick={onEventClick}
              getHref={getEventHref}
            />
          ) : null}
          {activeView === "month" ? (
            <MonthView
              date={cursorDate}
              events={calendarEvents}
              selectedRefId={selectedUid}
              onEventClick={onEventClick}
              getHref={getEventHref}
            />
          ) : null}
        </div>
      )}

      <BookingDetailModal uid={selectedUid} onUidChange={setSelectedUid} />
    </OhPageShell>
  );
}

// Format a Date to "YYYY-MM-DD" using LOCAL components (matches the
// `parseCursorDate` helper in `page.tsx` — local-component round-
// trip avoids the UTC-offset drift that would otherwise shift the
// cursor to the previous day in negative-offset zones).
function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Format the count beside the tab label.
// 0–99 → `00`, `01`, …, `99` (padded so digit width is stable across
// updates and tabular-nums keeps the rest from shimmying).
// ≥100  → `99+` (more than 99 in either tab is a long-tail edge case
// for a single-host scheduling app; clamp so the tab label doesn't
// blow out the bar's width).
function formatCount(n: number): string {
  if (n >= 100) return "99+";
  return String(n).padStart(2, "0");
}

// Tablist with a per-tab underline that animates between tabs via
// FLIP (First, Last, Invert, Play).
//
// SSR correctness: the underline is rendered as a child of the active
// tab (conditional on `isActive`). React emits it in SSR HTML at the
// correct position via pure CSS (`absolute left:0 right:0 bottom:-5px`
// inside the trigger). Browser paints it on first frame — no JS
// measurement, no flash-of-no-bar while the bundle hydrates.
// (Earlier shared-bar version positioned the underline via gsap.set
// after hydration. The SSR HTML had width:0 → paint with no visible
// bar → JS hydrates → bar snaps in. ~500-1000ms gap on slow networks.
// Per-tab CSS positioning eliminates the gap.)
//
// Animation: when activeTab changes, the OLD underline unmounts (its
// parent trigger lost `isActive`) and the NEW underline mounts inside
// the NEW active tab at its CSS-final position. GSAP FLIP captures
// the OLD trigger's geometry (still in DOM, just not active), then
// `gsap.from()` temporarily transforms the new underline back to the
// old position + size, then animates back to identity. Net effect:
// the underline appears to slide between tabs, but the final state
// is always pure CSS — no JS measurement holds the position.
//
// References: GSAP forum topic #39455 (Next.js + Flip + SSR — "ensure
// the initial styling state of the component is correct" so first
// paint shows the final state, not a default-zero state). CSS-Tricks:
// "Animating Layouts with the FLIP Technique."
//
// Exported (B.PT118) so the dev playground at `/playground/animations/
// bookings-tabs` can render this in isolation against a controlled
// `activeTab` toggle. The FLIP refs + timeline live entirely on its
// own scope, no parent context needed.
export function BookingsTabBar({
  activeTab,
  upcomingCount,
  pastCount,
  tablistLabel,
  upcomingLabel,
  pastLabel,
}: {
  activeTab: Tab;
  upcomingCount: number;
  pastCount: number;
  tablistLabel: string;
  upcomingLabel: string;
  pastLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const upcomingRef = useRef<HTMLButtonElement>(null);
  const pastRef = useRef<HTMLButtonElement>(null);
  // Initialize with the current tab so the first useGSAP run sees
  // prev === current and returns early — no animation on mount, the
  // SSR-rendered underline is already at the correct position.
  const prevActiveRef = useRef<Tab>(activeTab);

  useGSAP(
    () => {
      const prev = prevActiveRef.current;
      if (prev === activeTab) return;
      prevActiveRef.current = activeTab;

      const fromEl =
        prev === "upcoming" ? upcomingRef.current : pastRef.current;
      const toEl =
        activeTab === "upcoming" ? upcomingRef.current : pastRef.current;
      if (!fromEl || !toEl) return;

      const newUnderline = toEl.querySelector<HTMLSpanElement>(
        "[data-tab-underline]",
      );
      if (!newUnderline) return;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // FLIP the new underline from the old tab's geometry to its own
      // (CSS-final) geometry. transform-only animation — GPU-friendly,
      // doesn't trigger layout. transformOrigin: "left" so scaleX
      // grows/shrinks from the left edge instead of center.
      gsap.from(newUnderline, {
        x: fromRect.left - toRect.left,
        scaleX: fromRect.width / toRect.width,
        transformOrigin: "left center",
        duration: 0.35,
        ease: "power3.inOut",
        overwrite: true,
      });
    },
    { scope: listRef, dependencies: [activeTab] },
  );

  return (
    <TabsList
      ref={listRef}
      aria-label={tablistLabel}
      // variant="line" kills the primitive's default bg-muted fill +
      // active pill. The per-tab `::after` from the line variant is
      // hidden via after:hidden in BookingTabTrigger — our explicit
      // child <span> with [data-tab-underline] replaces it.
      variant="line"
      className="h-auto w-fit gap-4 p-0"
    >
      <BookingTabTrigger
        ref={upcomingRef}
        value="upcoming"
        count={upcomingCount}
        isActive={activeTab === "upcoming"}
      >
        {upcomingLabel}
      </BookingTabTrigger>
      {/* Hairline vertical rule — 1px, 22% ink. Drawn at the
          cap-height of the mono labels so it reads as a visual
          separator between two equal text affordances. aria-hidden
          because it's decorative; tablist keyboard nav skips it. */}
      <span
        aria-hidden
        className="inline-block h-3.5 w-px self-center bg-oh-line"
      />
      <BookingTabTrigger
        ref={pastRef}
        value="past"
        count={pastCount}
        isActive={activeTab === "past"}
      >
        {pastLabel}
      </BookingTabTrigger>
    </TabsList>
  );
}

// forwardRef so BookingsTabBar can measure each trigger's
// getBoundingClientRect for the FLIP underline animation.
const BookingTabTrigger = forwardRef<
  HTMLButtonElement,
  {
    value: Tab;
    count: number;
    isActive: boolean;
    children: React.ReactNode;
  }
>(function BookingTabTrigger({ value, count, isActive, children }, ref) {
  return (
    <TabsTrigger
      ref={ref}
      value={value}
      className={[
        // Layout: text-only trigger, no bg / border / segmented-control
        // chrome. Padding y=1 just to give the focus ring some breathing
        // room around the cap-height of the label. `after:hidden` kills
        // the line-variant's per-trigger underline pseudo — the shared
        // sliding bar (rendered by <BookingsTabBar>) replaces it.
        "group/tab inline-flex items-center gap-2 h-auto rounded-none border-0 bg-transparent p-0 py-1",
        "shadow-none data-active:shadow-none after:hidden",
        // Cursor + hit-area: the canonical "expanded hit area" pattern
        // (51bits.com/expanded-hit-areas, shadeed.ishadeed.com). Pointer
        // cursor signals "this is clickable" (Tailwind Preflight sets
        // <button> to cursor-default by default). The `::before` pseudo
        // is an invisible absolute-positioned rectangle extending 8px
        // horizontally and 16px vertically beyond the text — clicks on
        // it route to the trigger element, layout is unchanged. Clears
        // WCAG 2.5.8 (24px) and Apple HIG (44px) target sizes.
        "cursor-pointer",
        "before:content-[''] before:absolute before:-inset-x-2 before:-inset-y-4",
        // Mono caps eyebrow vocabulary, matches the rest of the chrome
        // (oh-eyebrow utility) but slightly larger (11px vs 10px) for
        // the primary tablist surface. tabular-nums on the digits so the
        // count doesn't shift columns when it updates from the SSE queue.
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase tabular-nums",
        // Idle = subtle (35% ink); active = full ink. Opacity gap is
        // wide so the active tab visibly leads the inactive one.
        // Hover bumps inactive → full ink. Focus also bumps to ink:
        // click instantly focuses the trigger (synchronously, before
        // React commits), so when the user clicks then moves the
        // mouse out fast, focus keeps the color at ink during the
        // ~30ms commit window. Without focus, that window saw a
        // brief subtle (gray) dip — the flash the user reported.
        // After commit, data-active also gives ink, so the focus
        // rule becomes redundant and stays harmless.
        "text-[color:var(--oh-content-subtle)] data-active:text-[color:var(--oh-ink)] hover:text-[color:var(--oh-ink)] focus:text-[color:var(--oh-ink)]",
        // No transitions on the trigger. Click → text snaps instantly
        // to ink (active) / subtle (inactive); hover snaps too. The
        // sliding underline (animated via gsap in BookingsTabBar) is
        // the only motion on the tab strip — text color is binary.
        // `transition-none` is needed to override shadcn's baked-in
        // `transition-all` from tabs.tsx (line 61), which would
        // otherwise re-introduce a 150ms color fade on data-active flip.
        "transition-none",
        // B.PT105 — unified focus shadow vocabulary (oh-focus-ring class).
        "oh-focus-ring",
        // Suppress iOS Safari's grey tap highlight (same convention as
        // OhMenuTrigger — chrome-toggle pattern).
        "[-webkit-tap-highlight-color:transparent]",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      {/* Count is dimmed only on the ACTIVE side (label 100%, count
          65%) to keep the label-primary / count-secondary hierarchy
          when the tab is selected. Inactive: count inherits the
          parent's 35% — adding more dim there would make it vanish. */}
      <span className="leading-none group-data-[state=active]/tab:opacity-65">
        {formatCount(count)}
      </span>
      {/* Per-tab underline. Renders only when this tab is active.
          Pure CSS positioning (absolute inside the relative trigger)
          so SSR HTML paints it at the correct position on first
          frame — no JS measurement holds the position. The FLIP
          animation in BookingsTabBar transforms this element FROM
          the old tab's geometry on each tab change; CSS-final state
          is always correct. data-tab-underline is the queryable
          handle for that animation. */}
      {isActive ? (
        <span
          data-tab-underline
          aria-hidden
          className="pointer-events-none absolute bottom-[-5px] left-0 right-0 h-0.5 bg-[var(--oh-ink)]"
        />
      ) : null}
    </TabsTrigger>
  );
});

type Booking = {
  id: number;
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date | string;
};

function BookingsListPanel({
  tab,
  bookings,
  onSelect,
}: {
  tab: Tab;
  bookings: Booking[];
  onSelect: (uid: string) => void;
}) {
  if (bookings.length === 0) return <EmptyBookings tab={tab} />;
  return (
    <ul
      role="list"
      className="divide-y divide-oh-line"
    >
      {bookings.map((b) => (
        <li
          key={b.id}
          className="[&:only-child]:border-b [&:only-child]:border-oh-line"
        >
          <BookingRow
            publicUid={b.publicUid}
            visitorName={b.visitorName}
            visitorEmail={b.visitorEmail}
            question={b.question}
            slotStart={new Date(b.slotStart as unknown as string)}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function BookingRow({
  publicUid,
  visitorName,
  visitorEmail,
  question,
  slotStart,
  onSelect,
}: {
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date;
  onSelect: (uid: string) => void;
}) {
  // B.PT26 — locale-aware date label. ICU `weekday: "short"` +
  // `month: "short"` + `day: "numeric"` produces "Mon Jul 15" / "Lun
  // jul 15" verbatim, replacing the prior hand-rolled WEEKDAY_SHORT +
  // MONTH_SHORT arrays. The oh-eyebrow class uppercases via CSS so
  // the visual rhythm is preserved.
  const format = useFormatter();
  const slotDateLabel = format.dateTime(slotStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <Link
      href={`/bookings/${publicUid}`}
      onClick={(e) => {
        // Plain left-click → open modal in place. Cmd/ctrl/shift/
        // middle-click fall through to the standalone page route so
        // power users can open the deep link in a new tab.
        if (
          e.defaultPrevented ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return;
        }
        e.preventDefault();
        onSelect(publicUid);
      }}
      className="group block px-4 py-4 transition-colors duration-150 ease-oh hover:bg-oh-tint-hover focus-visible:bg-oh-tint-hover focus-visible:outline-none"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {visitorName}
        </h3>
        <span className="oh-eyebrow tabular-nums">
          {fmtSlotTime(slotStart)}
        </span>
      </header>

      <p className="oh-eyebrow mt-2 tabular-nums">{slotDateLabel}</p>

      {question ? (
        <p className="mt-2 text-[13px] italic opacity-75 leading-relaxed">
          “{question}”
        </p>
      ) : null}

      <p className="mt-2 font-[family-name:var(--oh-mono)] text-[12px] tabular-nums opacity-55 truncate">
        {visitorEmail}
      </p>
    </Link>
  );
}

function LiveQueue() {
  const t = useTranslations("Bookings");
  const utils = trpc.useUtils();
  // Initial state: "connecting" (amber). Same architectural fix as
  // the tab underline — render the indicator at its visible state on
  // first paint via SSR HTML, no JS-deferred reveal. Earlier shape
  // started at "hidden" + setTimeout(500ms) → "connecting"; the
  // 500ms delay was meant to skip the amber flash if SSE connects
  // fast, but it cost us the dot's visibility for half a second on
  // every page load. Better: show the amber dot immediately, let
  // the SSE callbacks transition it to "live" (green) or "off"
  // (grey) when they fire. The amber→green transition is meaningful
  // ("connection just succeeded"), not noise.
  const [status, setStatus] = useState<
    "connecting" | "live" | "off"
  >("connecting");
  const [pulseKey, setPulseKey] = useState(0);

  trpc.bookings.queue.useSubscription(undefined, {
    onStarted: () => setStatus("live"),
    onError: () => setStatus("off"),
    onData: ({ data: event }) => {
      if (event.type === "created") {
        toast.success(t("toastNewBooking", { name: event.visitorName }));
      } else {
        toast(t("toastCancelled", { name: event.visitorName }));
      }
      utils.bookings.listForHost.invalidate();
      setPulseKey((k) => k + 1);
    },
  });

  return <LiveDot status={status} pulseKey={pulseKey} t={t} />;
}

function LiveDot({
  status,
  pulseKey,
  t,
}: {
  status: "connecting" | "live" | "off";
  pulseKey: number;
  t: ReturnType<typeof useTranslations<"Bookings">>;
}) {
  const tone =
    status === "live"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-neutral-400";
  const ariaLabel =
    status === "live"
      ? t("liveConnected")
      : status === "connecting"
        ? t("liveConnecting")
        : t("liveOff");

  return (
    <span
      key={pulseKey}
      role="status"
      aria-label={ariaLabel}
      className={[
        "oh-live-dot inline-block size-2 shrink-0 rounded-full",
        "transition-colors duration-200 ease-oh",
        tone,
      ].join(" ")}
    />
  );
}

function EmptyBookings({ tab }: { tab: Tab }) {
  const t = useTranslations("Bookings");
  const { data: me } = trpc.users.me.useQuery();

  return (
    <OhEmpty>
      <OhEmptyHeader>
        <OhEmptyMedia>
          <CalendarIcon />
        </OhEmptyMedia>
        <OhEmptyTitle>
          {tab === "upcoming" ? t("emptyUpcomingTitle") : t("emptyPastTitle")}
        </OhEmptyTitle>
        <OhEmptyDescription>
          {tab === "upcoming"
            ? t("emptyUpcomingDescription")
            : t("emptyPastDescription")}
        </OhEmptyDescription>
      </OhEmptyHeader>
      {tab === "upcoming" && me?.handle ? (
        <OhEmptyContent>
          <Link
            href={`/preview/${me.handle}`}
            // `!underline` + `!decoration-...` because globals.css line 756
            // has an unlayered `:where(.oh-root a) { text-decoration: none }`
            // shell reset. Unlayered CSS beats Tailwind's utilities layer
            // regardless of specificity (per the Cascade Layers spec).
            // The `!important` prefix reverses layer order so the layered
            // utilities win — same gotcha called out in dashboard-forms.md
            // *Hover + color contracts*.
            //
            // Both text + underline use `--oh-content-muted` (~55% ink) at
            // rest so the link reads as the tertiary-quiet affordance the
            // empty state intends — visible enough to act on, quiet enough
            // not to compete with the title/icon. Hover lifts both to full
            // ink (the standard tertiary dashboard pattern).
            className="oh-focus-ring text-[13px] font-medium text-[color:var(--oh-content-muted)] !underline !underline-offset-4 !decoration-[1.5px] !decoration-[color:var(--oh-content-muted)] transition-colors hover:text-[color:var(--oh-ink)] hover:!decoration-[color:var(--oh-ink)]"
          >
            {t("emptyCta")}
          </Link>
        </OhEmptyContent>
      ) : null}
    </OhEmpty>
  );
}

export { MailIcon };

function fmtSlotTime(d: Date): string {
  const hour24 = d.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour12}:${minute} ${suffix}`;
}
