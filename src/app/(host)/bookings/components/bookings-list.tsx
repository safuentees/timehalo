"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarIcon, MailIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { bookingDensityWindow, startOfToday } from "@/lib/availability";
import { HalftoneMasthead } from "@/app/h/[handle]/components/halftone-masthead";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";

type Tab = "upcoming" | "past";

const DENSITY_WINDOW_DAYS = 14;

export function BookingsList() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const utils = trpc.useUtils();
  const { data } = trpc.bookings.listForHost.useQuery();
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "off">(
    "connecting",
  );

  // Live queue subscription. Whenever the server emits a booking event
  // for this host, we toast the news + invalidate listForHost so the
  // dashboard reflects it without a refresh. The subscription closes
  // automatically when the component unmounts (tRPC handles the
  // AbortSignal on its end).
  trpc.bookings.queue.useSubscription(undefined, {
    onStarted: () => setLiveStatus("live"),
    onError: () => setLiveStatus("off"),
    onData: ({ data: event }) => {
      if (event.type === "created") {
        toast.success(`New booking from ${event.visitorName}`);
      } else {
        toast(`Cancelled: ${event.visitorName}`);
      }
      utils.bookings.listForHost.invalidate();
    },
  });

  const list = tab === "upcoming" ? data?.upcoming ?? [] : data?.past ?? [];
  const upcoming = data?.upcoming ?? [];
  const totalUpcoming = upcoming.length;

  // Density across the next 14 calendar days, normalized 0..1 to the
  // busiest day in the window. Computed client-side from the same query.
  const density = useMemo(
    () => bookingDensityWindow(upcoming, startOfToday(), DENSITY_WINDOW_DAYS),
    [upcoming],
  );

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title="Your bookings" />
      <LiveIndicator status={liveStatus} />

      {/* Density strip — Tier C #7 from HALFTONE-IDEAS.md. Booking
          volume per day across the next 14 days, encoded as halftone
          density. Shows up only when there's actual upcoming load. */}
      {totalUpcoming > 0 ? (
        <DensityStrip density={density} totalUpcoming={totalUpcoming} />
      ) : null}

      {/* Segmented control — Apple HIG: small set of mutually-exclusive
          views, persistent visual presence so users can switch back.
          overflow-hidden + rounded so child SegButtons clip to the curve
          (otherwise the inner border-r-2 on each button would overshoot). */}
      <div className="mt-6 inline-flex overflow-hidden rounded-(--bru-r-sm) border-2 border-bru-line-strong">
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
      onClick={onClick}
      aria-pressed={active}
      className={[
        "px-4 py-2 font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "transition-colors duration-150 ease-bru",
        "border-r-2 border-bru-line-strong last:border-r-0",
        active
          ? "bg-bru-content text-bru-bg"
          : "bg-bru-bg text-bru-content hover:bg-bru-tint",
      ].join(" ")}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={[
            "ml-2 inline-flex items-center justify-center min-w-[22px] px-1 py-0.5",
            "rounded-(--bru-r-xs) text-[10px] tabular-nums",
            active
              ? "bg-bru-bg text-bru-content"
              : "bg-bru-tint text-bru-content",
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
  return (
    <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-5 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase tabular-nums opacity-55">
            {fmtSlotDate(slotStart)}
          </span>
          <h3 className="text-[18px] leading-[1.1] font-black truncate">
            {visitorName}
          </h3>
        </div>
        <span className="font-[family-name:var(--bru-mono)] text-[15px] font-extrabold tabular-nums">
          {fmtSlotTime(slotStart)}
        </span>
      </header>

      {question ? (
        <p className="mt-3 text-[14px] leading-[1.55] opacity-75">
          “{question}”
        </p>
      ) : null}

      <p className="mt-3 inline-flex items-center gap-1.5 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-55">
        <MailIcon className="size-3" />
        {visitorEmail}
      </p>
    </article>
  );
}

// Small status pill above the density strip — surfaces SSE
// connection state so the host knows whether their dashboard is live
// or stale. Three states:
//  - connecting: yellow dot, "CONNECTING" — initial / transient
//  - live: green dot with a soft pulse, "LIVE" — connection open
//  - off: grey dot, "OFFLINE" — error / browser tab backgrounded too
//    long for the SSE keepalive
function LiveIndicator({
  status,
}: {
  status: "connecting" | "live" | "off";
}) {
  const tone =
    status === "live"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-neutral-400";
  const label =
    status === "live"
      ? "LIVE"
      : status === "connecting"
        ? "CONNECTING"
        : "OFFLINE";
  return (
    <p className="mt-3 inline-flex items-center gap-2 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-70">
      <span
        aria-hidden
        className={`inline-block size-1.5 rounded-full ${tone} ${
          status === "live" ? "animate-pulse" : ""
        }`}
      />
      {label}
    </p>
  );
}

function DensityStrip({
  density,
  totalUpcoming,
}: {
  density: number[];
  totalUpcoming: number;
}) {
  // Find the busiest day's index for the inline label. Ties go to the
  // earliest day — the bigger story is "next spike" not "tied for X".
  let peakIdx = 0;
  let peakVal = -1;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > peakVal) {
      peakVal = density[i];
      peakIdx = i;
    }
  }
  const peakDate = new Date();
  peakDate.setHours(0, 0, 0, 0);
  peakDate.setDate(peakDate.getDate() + peakIdx);
  const showsPeak = peakVal > 0;

  return (
    <section
      aria-label="Booking volume next 14 days"
      className="mt-6 overflow-hidden rounded-(--bru-r-sm) border-2 border-bru-line-strong"
    >
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-bru-line-strong px-3 py-2">
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase tabular-nums opacity-70">
          {totalUpcoming} booked
        </span>
        {showsPeak ? (
          <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase tabular-nums opacity-70">
            Peak {fmtPeakLabel(peakDate)}
          </span>
        ) : null}
      </header>
      <div className="relative h-[64px] bg-bru-bg">
        <HalftoneMasthead
          density={density}
          gridX={42}
          gridY={5}
          alpha={0.55}
          maxR={3.2}
          minR={0.5}
          className="absolute inset-0"
        />
      </div>
    </section>
  );
}

function fmtPeakLabel(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function EmptyBookings({ tab }: { tab: Tab }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarIcon />
        </EmptyMedia>
        <EmptyTitle>
          {tab === "upcoming"
            ? "No upcoming bookings"
            : "No past bookings"}
        </EmptyTitle>
        <EmptyDescription>
          {tab === "upcoming"
            ? "Visitors who book a slot will show up here."
            : "Bookings that have come and gone live in this tab."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
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
