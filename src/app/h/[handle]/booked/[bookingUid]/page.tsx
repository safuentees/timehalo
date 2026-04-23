import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { BookingConfirmation } from "./booking-confirmation";

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ handle: string; bookingUid: string }>;
}) {
  const { handle, bookingUid } = await params;
  const trpc = await createPublicSSRHelper();
  let booking;

  try {
    booking = await trpc.bookings.getPublicConfirmation.fetch({
      handle,
      bookingUid,
    });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }

    throw err;
  }

  return <BookingConfirmation booking={booking} />;
}
