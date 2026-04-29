"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

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
