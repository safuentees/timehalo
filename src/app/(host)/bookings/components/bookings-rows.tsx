"use client";

import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/hooks";
import {
  BookingRow,
  EmptyBookings,
  type Booking,
  type Tab,
} from "./bookings-list";

// Client-side rows island. Reads tab from URL search params
// (`?tab=upcoming|past`), reads bookings from the React Query cache
// via `useSuspenseQuery`. The hydrated cache (set up by
// `BookingsRowsBoundary`'s `<HydrationBoundary>`) means
// `useSuspenseQuery` returns immediately on first render — no client
// suspend, no fetch, no skeleton flash post-hydration. cal.com's
// `BookingsList` view follows the same shape (reads filtered status
// from the URL, renders rows from a server-prefetched cache). Tanstack
// docs *Server Rendering > Suspense Considerations*: "you can use
// `useSuspenseQuery` instead of `useQuery` as long as you always
// prefetch all your queries."

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
      {list.map((b: Booking) => (
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
