import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import BookingDetailDrawer from "./booking-detail-drawer";

// Intercepted booking detail (A7). When the host navigates from
// /bookings to /bookings/<publicUid>, this slot is rendered inside
// the host layout's @modal parallel slot — the URL deep-links, but
// the visual frame is a side Sheet over the bookings list. Hard
// refresh of /bookings/<publicUid> goes to the dedicated full-page
// route at src/app/(host)/bookings/[publicUid]/page.tsx (Next's
// intercepted-route fallback behavior).
//
// SSR prefetch is identical to the full page so the drawer also
// hydrates without a loading flash. NOT_FOUND mirrors the page
// route — there's no enumeration leak, the drawer simply doesn't
// open.
export default async function InterceptedBookingDetail({
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
      <BookingDetailDrawer publicUid={publicUid} />
    </HydrationBoundary>
  );
}
