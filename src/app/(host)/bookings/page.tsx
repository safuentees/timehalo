import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList } from "./components/bookings-list";

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
