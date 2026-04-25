"use client";

import { useState } from "react";
import { CalendarIcon, MailIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type Tab = "upcoming" | "past";

export function BookingsList() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const { data } = trpc.bookings.listForHost.useQuery();

  const list = tab === "upcoming" ? data?.upcoming ?? [] : data?.past ?? [];

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="border-b-2 border-bru-line-strong pb-6">
        <p className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55">
          Host · Bookings
        </p>
        <h1 className="mt-3 text-bru-h2 font-black uppercase tracking-tight">
          Your bookings
        </h1>
      </div>

      <div className="mt-6 inline-flex border-2 border-bru-line-strong">
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
    </div>
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
    <article className="border-[1.5px] border-bru-line bg-bru-bg p-5 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2.2px] uppercase opacity-55">
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
  return `${WEEKDAY_SHORT[d.getDay()]} · ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function fmtSlotTime(d: Date): string {
  const hour24 = d.getHours();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour12}:${minute} ${suffix}`;
}
