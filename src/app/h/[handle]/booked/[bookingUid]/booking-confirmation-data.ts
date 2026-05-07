import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { createPublicSSRHelper } from "@/trpc/server-helpers";

export async function getBookingConfirmation(
  handle: string,
  bookingUid: string,
) {
  const trpc = await createPublicSSRHelper();

  try {
    return await trpc.bookings.getPublicConfirmation.fetch({
      handle,
      bookingUid,
    });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }

    throw err;
  }
}
