import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import BookingDetail from "./components/booking-detail";

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
