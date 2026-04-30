import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { BookingsList } from "./components/bookings-list";

// Bookings — primary host surface. Apple HIG: the screen the user
// "came for" is one tap from launch (here: zero, since `/` redirects).
export default async function BookingsPage() {
  const trpc = await createPrivateSSRHelper();
  // Parallel prefetch. featureFlags drives whether <LiveQueue /> mounts
  // at all — without it, the flag arrives ~50-200ms after first paint
  // and the live-queue dot's wrapping <div> appears in a second pass,
  // shifting layout. Prefetching makes the first server render know the
  // truth so the aside slot is stable from byte one.
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.featureFlags.prefetch(),
  ]);

  return (
    <main className="oh-main">
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <BookingsList />
      </HydrationBoundary>
    </main>
  );
}
