import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import BookingDetail from "./components/booking-detail";

// Host-side booking detail. Server-prefetches the single
// bookings.getDetail query so the page lands hydrated — no flash
// like the dub.co skeleton-on-every-visit pattern, and the segmented
// info/history toggle works from first paint.
//
// NOT_FOUND on either an invalid uid OR a uid the caller doesn't own
// (procedure surfaces the same shape for both — no enumeration leak).
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ publicUid: string }>;
}) {
  const { publicUid } = await params;
  const trpc = await createPrivateSSRHelper();
  try {
    await trpc.bookings.getDetail.fetch({ publicUid });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  await trpc.bookings.getDetail.prefetch({ publicUid });

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <BookingDetail publicUid={publicUid} />
    </HydrationBoundary>
  );
}
