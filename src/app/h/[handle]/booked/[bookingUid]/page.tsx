import type { Metadata } from "next";
import { BookingConfirmation } from "./booking-confirmation";
import { getBookingConfirmation } from "./booking-confirmation-data";

export const metadata: Metadata = {
  title: "Booking confirmed — Officehours",
  description: "Your booking is confirmed. Add it to your calendar.",
  robots: { index: false, follow: false },
};

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ handle: string; bookingUid: string }>;
}) {
  const { handle, bookingUid } = await params;
  const booking = await getBookingConfirmation(handle, bookingUid);

  return <BookingConfirmation booking={booking} />;
}
