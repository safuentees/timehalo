"use client";

import { toast } from "sonner";
import { trpc, type ReactQueryOptions } from "@/trpc/hooks";

/**
 * Custom mutation hook for `users.setBookingHorizon` (B.PT308).
 * Persists the rolling-window cap (in calendar days) that the
 * visitor's day-strip on /h/<handle> respects. Passing `null` flips
 * the host back to unlimited. Different success copy for set vs
 * cleared so the host gets explicit feedback on either path.
 */

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
