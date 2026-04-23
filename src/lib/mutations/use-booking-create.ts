"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `bookings.create`. Error handling stays
 * centralized here while success is left to the caller so the booking
 * flow can choose between routing, inline confirmation, or another
 * post-submit handoff.
 *
 * Global invalidation in `trpc/hooks.ts` handles refreshing the
 * `schedule.getUpcomingSlots` cache so the booked chip disappears
 * from the visitor's view on next read.
 */

type Options = ReactQueryOptions["bookings"]["create"];

export function useBookingCreate(options?: Options) {
  return trpc.bookings.create.useMutation({
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
