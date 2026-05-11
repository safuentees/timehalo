"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

type Options = ReactQueryOptions["users"]["setBookingHorizon"];

export function useSetBookingHorizon(options?: Options) {
  return trpc.users.setBookingHorizon.useMutation({
    ...options,
    onSuccess: async (...args) => {
      const [, input] = args;
      toast.success(
        input.days == null
          ? "Booking window cleared."
          : `Booking window saved — ${input.days} ${
              input.days === 1 ? "day" : "days"
            } ahead.`,
      );
      await options?.onSuccess?.(...args);
    },
    onError: (...args) => {
      const [error] = args;
      toast.error(error.message);
      options?.onError?.(...args);
    },
  });
}
