"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `bookings.reschedule`. Mirrors
 * `use-booking-create`: error toast lives here, success is left to
 * the caller so the visitor can be routed to the new confirmation
 * page on resolve.
 *
 * Global invalidation refreshes `schedule.getUpcomingSlots` so the
 * old slot reappears in the picker (it's bookable again) and the
 * new slot disappears.
 */

type Options = ReactQueryOptions["bookings"]["reschedule"];

export function useRescheduleBooking(options?: Options) {
  return trpc.bookings.reschedule.useMutation({
    ...options,
    onSuccess: async (...args) => {
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
