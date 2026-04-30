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

// Shared bookings-page primitives. The page-level shape was
// rewritten under B.PT39 (granular Suspense pattern) — the chrome
// renders synchronously in `page.tsx` while the rows stream in
// through a `<Suspense>` boundary. This file keeps the cross-cutting
// pieces both halves consume:
//
//   • `BookingRow`         — divided-list row (cal.com pattern)
//   • `EmptyBookings`      — empty-state with the per-tab CTA
//   • `LiveQueue`          — SSE dot, mounted as the page-header aside
//   • `fmtSlotTime/Date`   — wire-string-to-display helpers
//   • `Booking` type       — narrowed wire shape, shared by client
//                            useSuspenseQuery + the rows skeleton

export type Tab = "upcoming" | "past";

// Mirrors the row shape returned by `bookings.listForHost.upcoming/past`.
// `id` is the integer primary key (autoincrement); `slotStart` arrives
// as an ISO string over the wire (no superjson transformer). Kept loose
// on the date type so the panel doesn't have to re-narrow on the boundary.
export type Booking = {
  id: number;
  publicUid: string;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date | string;
};

export function BookingRow({
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
  // Row anatomy:
  //   <header>      name (h3 font-black) | time (oh-eyebrow)
  //   <p>           date (oh-eyebrow)
  //   <p>           question (italic, only when present)
  //   <p>           email (mono, muted)
  // Whole row routes to the host-side detail page. Per chisel:
  // "labels are a last resort" — no separate "View" button.
  //
  // B.PT37 — divided-list shape. Border + bg lifted to the parent
  // <ul> as hairline dividers; the row itself just gets a hover bg
  // tint as the click cue. Cal.com pattern: `hover:bg-cal-muted` on
  // the row, no per-row border.
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
export function LiveQueue() {
  const t = useTranslations("Bookings");
  const utils = trpc.useUtils();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  const [status, setStatus] = useState<
    "hidden" | "connecting" | "live" | "off"
  >("hidden");
  const [pulseKey, setPulseKey] = useState(0);

  // Hidden-on-mount avoids flashing a "CONNECTING" state on fast
  // connections. setTimeout schedules the upgrade to visible-
  // connecting after 500ms; if `live` arrives first the state is
  // already past hidden and the timer is a no-op via the closure
  // check.
  useEffect(() => {
    if (!liveQueueEnabled) return;
    const handle = setTimeout(() => {
      setStatus((s) => (s === "hidden" ? "connecting" : s));
    }, 500);
    return () => clearTimeout(handle);
  }, [liveQueueEnabled]);

  trpc.bookings.queue.useSubscription(undefined, {
    enabled: liveQueueEnabled,
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

  if (!liveQueueEnabled) return null;

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
  const ariaLabel = isHidden
    ? undefined
    : status === "live"
      ? t("liveConnected")
      : status === "connecting"
        ? t("liveConnecting")
        : t("liveOff");

  return (
    <span
      key={pulseKey}
      role={isHidden ? undefined : "status"}
      aria-hidden={isHidden ? true : undefined}
      aria-label={ariaLabel}
      className={[
        "oh-live-dot inline-block size-2 shrink-0 rounded-full",
        "transition-colors duration-200 ease-oh",
        tone,
      ].join(" ")}
    />
  );
}

export function EmptyBookings({ tab }: { tab: Tab }) {
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
            className="oh-eyebrow border-[1.5px] border-oh-line-strong px-3 py-2 transition-colors hover:bg-oh-tint-hover"
          >
            {t("emptyCta")}
          </Link>
        </OhEmptyContent>
      ) : null}
    </OhEmpty>
  );
}

// `MailIcon` re-export keeps the import surface alive for callers
// that historically pulled it through this file. It's not actually
// used here anymore — the page-level header doesn't render an inbox
// affordance — but a future row variant might. Leaving the import
// to avoid a noisy `unused-import` churn during the granular-Suspense
// refactor.
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
