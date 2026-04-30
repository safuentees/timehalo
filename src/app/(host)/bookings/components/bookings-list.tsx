"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "next-view-transitions";
import { toast } from "sonner";
import { CalendarIcon, MailIcon } from "lucide-react";
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

type Tab = "upcoming" | "past";

// Mirrors the row shape returned by `bookings.listForHost.upcoming/past`.
// `id` is the integer primary key (autoincrement), `slotStart` arrives
// as an ISO string over the wire (no superjson transformer). Kept loose
// on the date type so the panel doesn't have to re-narrow on the boundary.
type Booking = {
  id: number;
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date | string;
};

export function BookingsList() {
  const t = useTranslations("Bookings");
  const [tab, setTab] = useState<Tab>("upcoming");
  const { data } = trpc.bookings.listForHost.useQuery();
  // Feature flag query — when live-queue is off, we don't even mount
  // the subscription child component. Server-side gate inside
  // bookings.queue is the source of truth (a stale client can't
  // bypass), but skipping the SSE connection on the client when we
  // know it's off saves a wasted round-trip + a connection slot.
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  return (
    <OhPageShell>
      <OhPageHeader
        title={t("title")}
        aside={liveQueueEnabled ? <LiveQueue /> : null}
      />

      <OnboardingChecklist />

      {/* Segmented filter, built on shadcn `<Tabs>` (Base UI underneath).
          Replaces a hand-rolled role="tablist" + buttons (B.PT36) — Base
          UI bakes role / aria-selected / arrow-key navigation, we just
          override the default pill chrome with the project's
          ink-on-paper inversion via `data-active:`. The count badge
          stays inline inside each `TabsTrigger` so the rhythm matches
          the prior segmented look. */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="mt-8"
      >
        <TabsList
          aria-label={t("tablistLabel")}
          className="h-auto w-fit gap-0 overflow-hidden rounded-(--oh-r-sm) border-2 border-oh-line-strong bg-transparent p-0"
        >
          <BookingTabTrigger value="upcoming" count={data?.upcoming.length}>
            {t("tabUpcoming")}
          </BookingTabTrigger>
          <BookingTabTrigger value="past" count={data?.past.length}>
            {t("tabPast")}
          </BookingTabTrigger>
        </TabsList>

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

function BookingTabTrigger({
  value,
  count,
  children,
}: {
  value: Tab;
  count?: number;
  children: React.ReactNode;
}) {
  // Override shadcn's default `bg-background` active treatment with
  // the project's ink-on-paper inversion, plus the segmented-control
  // divider on the right edge (last child clears it). Border-radius
  // 0 inside the wrapper keeps the two triggers flush against the
  // outer ink frame.
  return (
    <TabsTrigger
      value={value}
      className={[
        "h-auto flex-none rounded-none border-0 px-4 py-2.5",
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "border-r-2 border-oh-line-strong last:border-r-0",
        "data-active:!bg-oh-content data-active:!text-oh-bg data-active:!shadow-none",
        "hover:bg-oh-tint",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      {typeof count === "number" ? (
        <span className="tabular-nums text-[11px] font-bold leading-none opacity-45 group-data-[state=active]:opacity-65 data-active:opacity-65">
          {count}
        </span>
      ) : null}
    </TabsTrigger>
  );
}

function BookingsListPanel({
  tab,
  bookings,
}: {
  tab: Tab;
  bookings: Booking[];
}) {
  if (bookings.length === 0) return <EmptyBookings tab={tab} />;
  // Divided list (cal.com `BookingListItem` pattern). Hairline frame
  // top + bottom; rows separated by `divide-y` between them. Each row
  // has no own border — hover bg + chevron-free hit target gives the
  // click affordance, like cal.com's `hover:bg-cal-muted`. See
  // `oh-ui.md` *List patterns — content-divided list*.
  return (
    <ul
      role="list"
      className="border-y border-oh-line divide-y divide-oh-line"
    >
      {bookings.map((b) => (
        <li key={b.id}>
          <BookingRow
            publicUid={b.publicUid}
            visitorName={b.visitorName}
            visitorEmail={b.visitorEmail}
            question={b.question}
            // tRPC ships Date as ISO string over the wire (no
            // superjson transformer wired up). Parse client-side.
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
  // Row anatomy unchanged:
  //   <header>      name (h3 font-black) | time (oh-eyebrow)
  //   <p>           date (oh-eyebrow)
  //   <p>           question (italic, only when present)
  //   <p>           email (mono, muted)
  // The visitor name is the primary signal; time is the right-aligned
  // status; date is the subtitle. Whole row routes to the host-side
  // detail page (cal.com BookingDetailsSheet equivalent). Per chisel:
  // "labels are a last resort" — no separate "View" button. The
  // entire row is the affordance.
  //
  // B.PT37 — divided-list shape. Border + bg lifted to the parent
  // <ul> as hairline dividers; the row itself just gets a hover bg
  // tint as the click cue. Cal.com pattern: `hover:bg-cal-muted` on
  // the row, no per-row border. Reads as a continuous content feed
  // instead of a stack of cards.
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

// SSE subscription wrapper rendered as the `aside` of OhPageHeader.
// Only mounts when the `live-queue` feature flag is on; flipping the
// flag off unmounts cleanly, tearing down the subscription with no
// `enabled` flag plumbing.
//
// State machine:
//  - "hidden" (initial 500ms) — show nothing. Most connections finish
//    within this window, so users never see a transient state on
//    reload. If still hidden after 500ms, surface "connecting".
//  - "live" — solid green dot. Heartbeat animation fires on each
//    incoming event via the pulseKey remount trick.
//  - "connecting" — amber dot. Only visible past the 500ms grace.
//  - "off" — grey dot. Only on actual subscription error.
//
// No labels — color carries the state. ARIA describes it for screen
// readers. Per chisel: labels are a last resort.
function LiveQueue() {
  const t = useTranslations("Bookings");
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<
    "hidden" | "connecting" | "live" | "off"
  >("hidden");
  // Remount key — bumped on each event so the dot's CSS animation
  // re-runs, giving a subtle scale heartbeat tied to actual data.
  const [pulseKey, setPulseKey] = useState(0);

  // Hidden-on-mount avoids flashing a "CONNECTING" state on fast
  // connections. setTimeout schedules the upgrade to visible-
  // connecting after 500ms; if `live` arrives first the state is
  // already past hidden and the timer is a no-op via the closure
  // check.
  useEffect(() => {
    const t = setTimeout(() => {
      setStatus((s) => (s === "hidden" ? "connecting" : s));
    }, 500);
    return () => clearTimeout(t);
  }, []);

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

  // Always render the dot — never return null. The "hidden" state
  // collapses to a transparent + aria-hidden span that still occupies
  // the 8×8 + flex-gap slot, so the transition out of hidden is a
  // pure color crossfade with zero CLS. Returning null here on first
  // render and then conditionally re-rendering would shift the title
  // row when the dot first lands.
  return <LiveDot status={status} pulseKey={pulseKey} t={t} />;
}

function LiveDot({
  status,
  pulseKey,
  t,
}: {
  status: "hidden" | "connecting" | "live" | "off";
  pulseKey: number;
  t: ReturnType<typeof useTranslations<"Bookings">>;
}) {
  const isHidden = status === "hidden";
  const tone =
    status === "live"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : status === "off"
          ? "bg-neutral-400"
          : "bg-transparent";
  // No aria during the grace window — assistive tech shouldn't announce
  // a transient "connecting" that most users never see.
  const ariaLabel = isHidden
    ? undefined
    : status === "live"
      ? t("liveConnected")
      : status === "connecting"
        ? t("liveConnecting")
        : t("liveOff");

  return (
    <span
      // `key` re-mounts the span on each event so the CSS animation
      // re-runs — heartbeat tied to data, not idle decoration. Pulses
      // during the hidden state are no-ops because the dot is transparent.
      key={pulseKey}
      role={isHidden ? undefined : "status"}
      aria-hidden={isHidden ? true : undefined}
      aria-label={ariaLabel}
      className={[
        "oh-live-dot inline-block size-2 shrink-0 rounded-full",
        // Color crossfade between states — covers the hidden→connecting
        // and connecting→live transitions without a layout pass.
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
      {/* Audit `§4.2` follow-up (B.PT29): the upcoming-tab empty
          state's natural next step is "go collect bookings" — link
          to the host's public booking page. Past tab gets no action
          (going to the public page from "no past bookings" is
          irrelevant — past bookings can't be acquired retroactively). */}
      {tab === "upcoming" && me?.handle ? (
        <OhEmptyContent>
          <Link
            href={`/h/${me.handle}`}
            className="oh-eyebrow border-[1.5px] border-oh-line-strong px-3 py-2 transition-colors hover:bg-oh-tint-hover"
          >
            {t("emptyCta")}
          </Link>
        </OhEmptyContent>
      ) : null}
    </OhEmpty>
  );
}

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
