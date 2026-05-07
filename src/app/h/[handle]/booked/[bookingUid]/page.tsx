import { BookingConfirmation } from "./booking-confirmation";
import { getBookingConfirmation } from "./booking-confirmation-data";

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ handle: string; bookingUid: string }>;
}) {
  const { handle, bookingUid } = await params;
  const booking = await getBookingConfirmation(handle, bookingUid);

  return <BookingConfirmation booking={booking} />;
}
