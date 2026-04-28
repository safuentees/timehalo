"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarIcon, MailIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { BrutalistEmpty } from "@/components/brutalist/brutalist-empty";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { OnboardingChecklist } from "@/components/brutalist/onboarding-checklist";

type Tab = "upcoming" | "past";

export function BookingsList() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const { data } = trpc.bookings.listForHost.useQuery();
  // Feature flag query — when live-queue is off, we don't even mount
  // the subscription child component. Server-side gate inside
  // bookings.queue is the source of truth (a stale client can't
  // bypass), but skipping the SSE connection on the client when we
  // know it's off saves a wasted round-trip + a connection slot.
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  const list = tab === "upcoming" ? (data?.upcoming ?? []) : (data?.past ?? []);

  return (
    <BrutalistPageShell wide>
      <BrutalistPageHeader
        title="Your bookings"
        aside={liveQueueEnabled ? <LiveQueue /> : null}
      />

      <OnboardingChecklist />

      {/* Segmented control — single bordered group, two flat tabs.
          Apple HIG: small set of mutually-exclusive views, persistent
          visual presence so users can switch back. role="tablist" /
          role="tab" makes screen-readers announce the group as tabs;
          we also keep aria-selected on each button. The count is plain
          tabular-nums text inside the button (not a nested pill) —
          vertical-center comes from `inline-flex items-center` on the
          button itself, no baseline-alignment math needed. */}
      <div
        role="tablist"
        aria-label="Booking timeframe"
        className="mt-6 grid w-fit grid-cols-2 overflow-hidden rounded-(--bru-r-sm) border-2 border-bru-line-strong"
      >
        <SegButton
          active={tab === "upcoming"}
          count={data?.upcoming.length}
          onClick={() => setTab("upcoming")}
        >
          Upcoming
        </SegButton>
        <SegButton
          active={tab === "past"}
          count={data?.past.length}
          onClick={() => setTab("past")}
        >
          Past
        </SegButton>
      </div>

      <div className="mt-6">
        {list.length === 0 ? (
          <EmptyBookings tab={tab} />
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
            {list.map((b) => (
              <li key={b.id}>
                <BookingRow
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
        )}
      </div>
    </BrutalistPageShell>
  );
}

function SegButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2.5 px-4 py-2.5",
        "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "transition-colors duration-150 ease-bru",
        "border-r-2 border-bru-line-strong last:border-r-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bru-line-strong focus-visible:ring-inset",
        active
          ? "bg-bru-content text-bru-bg"
          : "bg-bru-bg text-bru-content hover:bg-bru-tint",
      ].join(" ")}
    >
      <span className="leading-none">{children}</span>
      {typeof count === "number" ? (
        <span
          className={[
            // Typographic count — not a nested pill. Same line-height
            // as the label, slightly lighter so the LABEL is the
            // primary signal and the count plays second fiddle.
            // Brutalist hierarchy: emphasize by de-emphasizing.
            "tabular-nums text-[11px] font-bold leading-none",
            active ? "opacity-65" : "opacity-45",
          ].join(" ")}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function BookingRow({
  visitorName,
  visitorEmail,
  question,
  slotStart,
}: {
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date;
}) {
  // Mobile (<sm): vertical stack — date band on top, identity in the
  //   middle, time as a footer accent. The shape the user already
  //   liked at 400px.
  // sm+: 3-col grid [date_fixed | identity_fluid | time_auto], items
  //   baseline-aligned. Date scans down the left edge (Cal.com's
  //   chronological list pattern), identity column truncates via
  //   min-w-0, time right-justifies.
  return (
    <article
      className={[
        "rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong",
        "sm:grid sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6 sm:p-5",
        "md:gap-x-8 md:p-6",
      ].join(" ")}
    >
      <div className="bru-eyebrow text-[11px] tabular-nums sm:text-[12px]">
        {fmtSlotDate(slotStart)}
      </div>

      <div className="mt-2 flex min-w-0 flex-col gap-1.5 sm:mt-0">
        <h3 className="text-[16px] leading-[1.2] font-black truncate sm:text-[17px]">
          {visitorName}
        </h3>
        {question ? (
          <p className="text-[13px] italic opacity-75 leading-relaxed">
            “{question}”
          </p>
        ) : null}
        <p className="font-[family-name:var(--bru-mono)] text-[12px] tabular-nums opacity-55 truncate">
          {visitorEmail}
        </p>
      </div>

      <div className="mt-3 inline-flex items-center self-start font-[family-name:var(--bru-mono)] text-[13px] font-extrabold tabular-nums sm:mt-0 sm:justify-end sm:text-[14px]">
        {fmtSlotTime(slotStart)}
      </div>
    </article>
  );
}

// SSE subscription wrapper rendered as the `aside` of BrutalistPageHeader.
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
        toast.success(`New booking from ${event.visitorName}`);
      } else {
        toast(`Cancelled: ${event.visitorName}`);
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
  return <LiveDot status={status} pulseKey={pulseKey} />;
}

function LiveDot({
  status,
  pulseKey,
}: {
  status: "hidden" | "connecting" | "live" | "off";
  pulseKey: number;
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
      ? "Live updates connected"
      : status === "connecting"
        ? "Connecting to live updates"
        : "Live updates offline";

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
        "bru-live-dot inline-block size-2 shrink-0 rounded-full",
        // Color crossfade between states — covers the hidden→connecting
        // and connecting→live transitions without a layout pass.
        "transition-colors duration-200 ease-bru",
        tone,
      ].join(" ")}
    />
  );
}

function EmptyBookings({ tab }: { tab: Tab }) {
  return (
    <BrutalistEmpty
      icon={CalendarIcon}
      title={tab === "upcoming" ? "No upcoming bookings" : "No past bookings"}
      description={
        tab === "upcoming"
          ? "Visitors who book a slot will show up here."
          : "Bookings that have come and gone live in this tab."
      }
    />
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
