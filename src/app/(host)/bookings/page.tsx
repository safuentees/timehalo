import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList } from "./components/bookings-list";

// Bookings — primary host surface. Apple HIG: the screen the user
// "came for" is one tap from launch (here: zero, since `/` redirects).
export default async function BookingsPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.bookings.listForHost.prefetch();

  return (
    <main className="bru-main">
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <BookingsList />
      </HydrationBoundary>
    </main>
  );
}
