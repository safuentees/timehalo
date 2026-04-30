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

type Tab = "upcoming" | "past";

export function BookingsList() {
  const t = useTranslations("Bookings");
  const [tab, setTab] = useState<Tab>("upcoming");
  const { data } = trpc.bookings.listForHost.useQuery();
  const { data: flags } = trpc.users.featureFlags.useQuery();
  const liveQueueEnabled = flags?.["live-queue"] ?? false;

  const list = tab === "upcoming" ? (data?.upcoming ?? []) : (data?.past ?? []);

  return (
    <OhPageShell>
      <OhPageHeader
        title={t("title")}
        aside={liveQueueEnabled ? <LiveQueue /> : null}
      />

      <OnboardingChecklist />

      <div
        role="tablist"
        aria-label={t("tablistLabel")}
        className="mt-8 grid w-fit grid-cols-2 overflow-hidden rounded-(--oh-r-sm) border-2 border-oh-line-strong"
      >
        <SegButton
          active={tab === "upcoming"}
          count={data?.upcoming.length}
          onClick={() => setTab("upcoming")}
        >
          {t("tabUpcoming")}
        </SegButton>
        <SegButton
          active={tab === "past"}
          count={data?.past.length}
          onClick={() => setTab("past")}
        >
          {t("tabPast")}
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
                  publicUid={b.publicUid}
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
    </OhPageShell>
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
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2px] uppercase",
        "transition-colors duration-150 ease-oh",
        "border-r-2 border-oh-line-strong last:border-r-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oh-line-strong focus-visible:ring-inset",
        active
          ? "bg-oh-content text-oh-bg"
          : "bg-oh-bg text-oh-content hover:bg-oh-tint",
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
      className="group block rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-4 transition-colors duration-150 ease-oh hover:border-oh-line-strong focus-visible:outline-none focus-visible:border-oh-line-strong"
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
