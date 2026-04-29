"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

// Custom mutation hook for `bookings.cancel`. Pattern: toast in
// hook, caller spreads options, caller's onSuccess/onError run
// after defaults. Same shape as use-set-timezone.

type Options = ReactQueryOptions["bookings"]["cancel"];

export function useCancelBooking(options?: Options) {
  return trpc.bookings.cancel.useMutation({
    ...options,
    onSuccess: async (...args) => {
      toast.success("Booking cancelled.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
