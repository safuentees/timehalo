"use client";

import { forwardRef, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { OnboardingChecklist } from "@/components/oh/onboarding-checklist";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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
// Tab state lives in the URL (`?tab=upcoming|past`) — passed in via
// the `activeTab` prop from `page.tsx`'s `searchParams` read; tab
// changes push to the URL via `router.push`, which re-runs the
// page's server tree without a full reload.
export function BookingsList({ activeTab }: { activeTab: Tab }) {
  const t = useTranslations("Bookings");
  const router = useRouter();
  const { data } = trpc.bookings.listForHost.useQuery();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  return (
    <OhPageShell>
      <OhPageHeader
        title={t("title")}
        aside={liveQueueEnabled ? <LiveQueue /> : null}
      />

      <OnboardingChecklist />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === activeTab) return;
          if (!VALID_TABS.includes(value as Tab)) return;
          router.push(`?tab=${value}`, { scroll: false });
        }}
        className="mt-8"
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
          />
        </TabsContent>
        <TabsContent value="past" className="mt-6">
          <BookingsListPanel tab="past" bookings={data?.past ?? []} />
        </TabsContent>
      </Tabs>
    </OhPageShell>
  );
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
function BookingsTabBar({
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
        // Hover bumps inactive → full ink (the standard hover-up
        // pattern from dashboard-forms.md).
        "text-[color:var(--oh-content-subtle)] data-active:text-[color:var(--oh-ink)] hover:text-[color:var(--oh-ink)]",
        // Color animates between active/inactive states. The shared
        // sliding underline animates separately via gsap.to() in
        // BookingsTabBar.
        "transition-colors duration-150 ease-oh",
        // Focus ring sits 4px out from the text — readable without
        // crashing into the count or the separator.
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-4",
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
}: {
  tab: Tab;
  bookings: Booking[];
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
}: {
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date;
}) {
  return (
    <Link
      href={`/bookings/${publicUid}`}
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

      <p className="oh-eyebrow mt-2 tabular-nums">{fmtSlotDate(slotStart)}</p>

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
            href={`/h/${me.handle}`}
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
            className="text-[13px] font-medium text-[color:var(--oh-content-muted)] !underline !underline-offset-4 !decoration-[1.5px] !decoration-[color:var(--oh-content-muted)] transition-colors hover:text-[color:var(--oh-ink)] hover:!decoration-[color:var(--oh-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oh-ink)] focus-visible:outline-offset-2"
          >
            {t("emptyCta")}
          </Link>
        </OhEmptyContent>
      ) : null}
    </OhEmpty>
  );
}

export { MailIcon };

const WEEKDAY_SHORT = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;
const MONTH_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function fmtSlotDate(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function fmtSlotTime(d: Date): string {
  const hour24 = d.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour12}:${minute} ${suffix}`;
}
