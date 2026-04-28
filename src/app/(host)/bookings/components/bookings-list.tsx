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
  return (
    <article
      className={[
        "rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong",
        "sm:grid sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-6 sm:p-5",
        "md:gap-x-8 md:p-6",
      ].join(" ")}
    >
      <div className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.2px] uppercase tabular-nums opacity-55 sm:text-[12px]">
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

function LiveQueue() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<
    "hidden" | "connecting" | "live" | "off"
  >("hidden");
  const [pulseKey, setPulseKey] = useState(0);

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
  const ariaLabel = isHidden
    ? undefined
    : status === "live"
      ? "Live updates connected"
      : status === "connecting"
        ? "Connecting to live updates"
        : "Live updates offline";

  return (
    <span
      key={pulseKey}
      role={isHidden ? undefined : "status"}
      aria-hidden={isHidden ? true : undefined}
      aria-label={ariaLabel}
      className={[
        "bru-live-dot inline-block size-2 shrink-0 rounded-full",
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
