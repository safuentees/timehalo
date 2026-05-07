import { getBookingConfirmation } from "../../../booked/[bookingUid]/booking-confirmation-data";
import { BookingReceiptModal } from "../../../booked/[bookingUid]/booking-receipt-modal";

export default async function InterceptedBookingReceiptPage({
  params,
}: {
  params: Promise<{ handle: string; bookingUid: string }>;
}) {
  const { handle, bookingUid } = await params;
  const booking = await getBookingConfirmation(handle, bookingUid);

  return <BookingReceiptModal booking={booking} />;
}
