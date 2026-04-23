"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `bookings.create`. Toast on success/error
 * baked in; callers can still pass their own `onSuccess` / `onError`
 * that run AFTER the defaults via the standard spread+override trick
 * from the other mutation hooks.
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
      toast.success("Booked. Check your email for the confirmation.");
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
