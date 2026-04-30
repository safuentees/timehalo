"use client";

import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/hooks";
import {
  BookingRow,
  EmptyBookings,
  type Booking,
  type Tab,
} from "./bookings-list";

const VALID_TABS = ["upcoming", "past"] as const;

function readTabFromParams(value: string | null): Tab {
  return VALID_TABS.includes(value as Tab) ? (value as Tab) : "upcoming";
}

export function BookingsRows() {
  const params = useSearchParams();
  const tab = readTabFromParams(params.get("tab"));
  const [data] = trpc.bookings.listForHost.useSuspenseQuery();
  const list = tab === "upcoming" ? data.upcoming : data.past;

  if (list.length === 0) return <EmptyBookings tab={tab} />;

  return (
    <ul
      role="list"
      className="border-y border-oh-line divide-y divide-oh-line"
    >
      {list.map((b: Booking) => (
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
  );
}
